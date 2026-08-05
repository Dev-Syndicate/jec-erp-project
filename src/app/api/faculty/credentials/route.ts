// POST /api/faculty/credentials — reissue temp passwords in bulk for staff who
// have not logged in yet, so an admin can print and hand out login slips.
//
// The student sibling (/api/students/credentials) explains the reasoning in
// full; the same two rules apply here:
//
//   - It RESETS rather than reads. Firebase stores only hashes and no Neon
//     column keeps a copy, so the passwords originally issued cannot be
//     retrieved. Any slip printed earlier stops working.
//   - It touches ONLY accounts still on their temp password (the "Invited"
//     state), so it can never lock out someone who has set their own.
//
// One CSV rather than the per-class split students get: staff are handed their
// slips as a department, not a class.
//
// WHO: `manage Faculty` scoped to the EMPLOYING department — a HOD covers their
// own staff, Super Admin covers everyone.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { regenerateTempPassword } from "@/lib/provisioning";

export const dynamic = "force-dynamic";

const MAX_PER_REQUEST = 300;

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Faculty");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    // Optional: one department. Omitted means "every department the caller may
    // act in" — for a HOD that is already just their own.
    const departmentId =
      typeof body?.departmentId === "string" && body.departmentId.trim() !== ""
        ? body.departmentId.trim()
        : null;
    if (departmentId) {
      authorize(ctx, "manage", "Faculty", { departmentId });
    }

    const staff = await db.facultyProfile.findMany({
      where: {
        ...(departmentId ? { departmentId } : {}),
        ...(ctx.isInstitutionScoped ? {} : { departmentId: ctx.departmentId ?? "__none__" }),
        user: { status: "ACTIVE", mustChangePassword: true },
      },
      select: {
        staffId: true,
        designation: true,
        department: { select: { code: true } },
        user: { select: { id: true, firebaseUid: true, displayName: true, email: true } },
      },
      orderBy: { staffId: "asc" },
    });

    if (staff.length > MAX_PER_REQUEST) {
      return Response.json(
        { error: `That's ${staff.length} accounts — at most ${MAX_PER_REQUEST} at a time.` },
        { status: 400 },
      );
    }

    const rows: Array<Record<string, string>> = [];
    const failed: Array<{ staffId: string; reason: string }> = [];

    for (const f of staff) {
      try {
        const password = await regenerateTempPassword({ id: f.user.id, firebaseUid: f.user.firebaseUid });
        rows.push({
          staffId: f.staffId,
          name: f.user.displayName,
          email: f.user.email,
          department: f.department.code,
          designation: f.designation,
          tempPassword: password,
        });
      } catch (e) {
        // One failure must not cost everyone else their slip.
        failed.push({ staffId: f.staffId, reason: e instanceof Error ? e.message : "Failed to reset." });
      }
    }

    return Response.json({ staff: rows, total: rows.length, failed });
  } catch (err) {
    return toAuthResponse(err);
  }
}
