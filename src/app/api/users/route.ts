// POST /api/users — provision a staff or student account (Phase 2/4 onboarding).
//
// The route shape (CLAUDE.md security boundary): authenticate → authorize (role
// + dept scope) → create the Firebase identity → create the linked Neon User
// (and Student row for students) → assign the role. The admin never sets the
// real password: a temp one is generated, returned here for delivery to the
// user's inbox, and mustChangePassword forces a reset on first login.
//
// Authorization (stopgap until CASL, mirrors the PRD scoping table):
//   - Super Admin  → may provision anyone, any department, incl. HODs.
//   - HOD          → may provision Teachers/Students in their OWN department.
//   - anyone else  → denied.
//
// Atomicity: the Firebase user is created first; if the Neon write then fails,
// the Firebase user is deleted so a retry doesn't collide on the email. The Neon
// writes run in one transaction (WS adapter) so a User with no role can't persist.
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { createFirebaseUser, deleteFirebaseUser } from "@/lib/firebase-admin";
import { generateTempPassword, provisionStudentAccount } from "@/lib/provisioning";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Roles this endpoint can grant. "Super Admin" is deliberately excluded — it's
// bootstrapped by the seed script, never provisioned through the API.
const PROVISIONABLE_ROLES = ["HOD", "Teacher", "Student"] as const;
type ProvisionableRole = (typeof PROVISIONABLE_ROLES)[number];

type Body = {
  email?: string;
  displayName?: string;
  role?: string;
  departmentId?: string | null;
  // Student anchor fields (the rest of the admission record is the wizard's job):
  rollNumber?: string;
  registerNumber?: string;
  dateOfBirth?: string; // ISO date
  phone?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
};

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    // Only Super Admin or HOD may provision at all.
    requireRole(ctx, "Super Admin", "HOD");

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });

    const { email, displayName, role } = body;
    if (!email || !displayName || !role) {
      return Response.json(
        { error: "email, displayName, and role are required." },
        { status: 400 },
      );
    }
    if (!PROVISIONABLE_ROLES.includes(role as ProvisionableRole)) {
      return Response.json(
        { error: `role must be one of: ${PROVISIONABLE_ROLES.join(", ")}.` },
        { status: 400 },
      );
    }
    const provisionRole = role as ProvisionableRole;

    // --- authorization: who may create what, where ------------------------
    // Only Super Admin can mint HODs (cross-department authority, PRD line 46).
    if (provisionRole === "HOD") requireRole(ctx, "Super Admin");

    // Department scoping. Students/Teachers/HODs all belong to a department.
    // Super Admin may target any; an HOD is pinned to their own.
    const departmentId = ctx.roles.includes("Super Admin")
      ? (body.departmentId ?? null)
      : ctx.user.departmentId;

    if (!departmentId) {
      return Response.json(
        { error: "departmentId is required for this account." },
        { status: 400 },
      );
    }
    // Reject an HOD reaching into another department (belt-and-braces; the line
    // above already pins them, but a Super Admin-supplied id is validated too).
    assertDeptScope(ctx, departmentId);

    // Confirm the department exists (FK would fail anyway; nicer error here).
    const dept = await db.department.findUnique({ where: { id: departmentId } });
    if (!dept) return Response.json({ error: "Unknown department." }, { status: 400 });

    // Student-specific required fields.
    const isStudent = provisionRole === "Student";
    if (isStudent) {
      // registerNumber is the login handle and required; rollNumber is optional
      // (college-given, may not exist yet). DOB and phone are required too.
      if (!body.registerNumber || !body.dateOfBirth || !body.phone) {
        return Response.json(
          { error: "registerNumber, dateOfBirth, and phone are required for students." },
          { status: 400 },
        );
      }
    }

    const roleRow = await db.role.findUnique({ where: { name: provisionRole } });
    if (!roleRow) {
      // Roles are seeded; a missing one is a server misconfiguration, not user error.
      throw new Error(`Role "${provisionRole}" is not seeded.`);
    }

    // --- students go through the shared provisioning helper ----------------
    // (Firebase create + Neon User+Student in a transaction + rollback on fail).
    // The bulk importer uses the SAME helper, so both paths stay identical.
    if (isStudent) {
      try {
        const { userId, studentId, tempPassword } = await provisionStudentAccount({
          email,
          displayName,
          departmentId,
          roleId: roleRow.id,
          registerNumber: body.registerNumber!,
          rollNumber: body.rollNumber,
          dateOfBirth: body.dateOfBirth!,
          phone: body.phone!,
          gender: body.gender ?? null,
        });
        return Response.json(
          {
            id: userId,
            // The Student row id — the admission wizard continues from here.
            studentId,
            email,
            displayName,
            role: provisionRole,
            departmentId,
            registerNumber: body.registerNumber!,
            rollNumber: body.rollNumber ?? null,
            // Returned ONCE for delivery to the user's inbox (results file /
            // email later). Not stored.
            tempPassword,
          },
          { status: 201 },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not save the account.";
        const status = /unique|constraint|already exists/i.test(msg) ? 409 : 500;
        return Response.json(
          { error: status === 409 ? "That email or register number is already in use." : "Could not save the account." },
          { status },
        );
      }
    }

    // --- staff (HOD / Teacher): no Student row --------------------------------
    const tempPassword = generateTempPassword();
    let firebaseUid: string;
    try {
      firebaseUid = await createFirebaseUser({ email, password: tempPassword, displayName });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not create the account.";
      return Response.json({ error: msg }, { status: 409 });
    }

    try {
      const created = await db.$transaction(async (tx) =>
        tx.user.create({
          data: {
            firebaseUid,
            email,
            displayName,
            departmentId,
            mustChangePassword: true,
            roles: { create: { roleId: roleRow.id } },
          },
        }),
      );

      return Response.json(
        {
          id: created.id,
          studentId: null,
          email: created.email,
          displayName: created.displayName,
          role: provisionRole,
          departmentId: created.departmentId,
          registerNumber: null,
          rollNumber: null,
          tempPassword,
        },
        { status: 201 },
      );
    } catch (e) {
      await deleteFirebaseUser(firebaseUid).catch((cleanupErr) =>
        console.error("Failed to roll back Firebase user after Neon error:", cleanupErr),
      );
      const msg = e instanceof Error ? e.message : "Could not save the account.";
      const status = /unique|constraint|already exists/i.test(msg) ? 409 : 500;
      return Response.json(
        { error: status === 409 ? "That email is already in use." : "Could not save the account." },
        { status },
      );
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}
