// /api/faculty/[id] — edit a faculty member's detail fields, employing
// department + active status. Department-scoped. params is a Promise in Next 16
// — await it.
//
// staffId (college id) and email (Firebase identity) ARE editable here. They
// differ in cost, and only one is a login handle:
//   - staffId is a Neon-only college id. Faculty sign in with their EMAIL, so
//     changing it doesn't touch authentication at all — it's unique, so a clash
//     is a 409.
//   - email IS the credential. Unlike students (who resolve a register number
//     first), faculty type their email straight into Firebase, so Neon and
//     Firebase must agree or the account becomes unreachable. The Firebase write
//     therefore happens AFTER the Neon transaction commits, and a Firebase
//     failure rolls the Neon email back.
//
// departmentId is the SCOPING KEY for staff (lives on FacultyProfile): moving a
// faculty member is allowed only within your scope (the target department is
// checked too), and busts the auth cache. Setting status to INACTIVE disables
// the login (User.status = INACTIVE) so a departed faculty member can't sign in;
// reactivating restores it — also cache-busted so it takes effect immediately
// rather than after the TTL.
import { authenticate, invalidateAuthUser, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateFirebaseEmail } from "@/lib/firebase-admin";
import { isUniqueViolation } from "@/lib/prisma-errors";
import {
  FACULTY_INCLUDE,
  toFacultyDto,
  validateAssignableRoles,
  validateDepartment,
} from "../dto";

export const dynamic = "force-dynamic";

type FacultyPatch = {
  displayName?: string;
  staffId?: string;
  email?: string;
  designation?: string;
  phone?: string;
  emergencyPhone?: string | null;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth?: string | null;
  maritalStatus?: "SINGLE" | "MARRIED" | "OTHER" | null;
  fatherName?: string | null;
  motherName?: string | null;
  status?: "ACTIVE" | "INACTIVE";
  // The employing department — the only scoping key a staff account has. There is
  // deliberately no programId: a faculty member's award granted nothing, so the
  // field is neither accepted nor returned.
  departmentId?: string;
  roleIds?: string[];
};

// Exported for unit tests — pure, no DB. See test/api/faculty-patch.test.ts.
export function parsePatchBody(body: unknown): { data: FacultyPatch } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;
  const data: FacultyPatch = {};

  if (b.displayName !== undefined) {
    const v = typeof b.displayName === "string" ? b.displayName.trim() : "";
    if (!v) return { error: "Name can't be empty." };
    data.displayName = v;
  }
  // Identity fields. staffId is a required unique college id; email is the
  // credential itself — neither may be blanked.
  if (b.staffId !== undefined) {
    const v = typeof b.staffId === "string" ? b.staffId.trim() : "";
    if (!v) return { error: "Staff ID can't be empty." };
    data.staffId = v;
  }
  if (b.email !== undefined) {
    // Same shape check as the student route and the bulk importer, so every
    // entry point agrees on what a valid address looks like. Lower-cased:
    // Firebase treats emails case-insensitively.
    const v = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!v) return { error: "Email can't be empty." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { error: `Invalid email: ${v}` };
    data.email = v;
  }
  if (b.designation !== undefined) {
    const v = typeof b.designation === "string" ? b.designation.trim() : "";
    if (!v) return { error: "Designation can't be empty." };
    data.designation = v;
  }
  if (b.phone !== undefined) {
    const v = typeof b.phone === "string" ? b.phone.trim() : "";
    if (!v) return { error: "Phone can't be empty." };
    data.phone = v;
  }
  if (b.emergencyPhone !== undefined) {
    data.emergencyPhone =
      typeof b.emergencyPhone === "string" && b.emergencyPhone.trim() !== ""
        ? b.emergencyPhone.trim()
        : null;
  }
  if (b.gender !== undefined) {
    data.gender =
      b.gender === "MALE" || b.gender === "FEMALE" || b.gender === "OTHER" ? b.gender : null;
  }
  if (b.dateOfBirth !== undefined) {
    if (b.dateOfBirth === null || b.dateOfBirth === "") {
      data.dateOfBirth = null;
    } else if (typeof b.dateOfBirth !== "string" || Number.isNaN(new Date(b.dateOfBirth).getTime())) {
      return { error: "Date of birth is invalid." };
    } else {
      data.dateOfBirth = b.dateOfBirth;
    }
  }
  if (b.maritalStatus !== undefined) {
    data.maritalStatus =
      b.maritalStatus === "SINGLE" || b.maritalStatus === "MARRIED" || b.maritalStatus === "OTHER"
        ? b.maritalStatus
        : null;
  }
  if (b.fatherName !== undefined) {
    data.fatherName =
      typeof b.fatherName === "string" && b.fatherName.trim() !== "" ? b.fatherName.trim() : null;
  }
  if (b.motherName !== undefined) {
    data.motherName =
      typeof b.motherName === "string" && b.motherName.trim() !== "" ? b.motherName.trim() : null;
  }
  if (b.status !== undefined) {
    if (b.status !== "ACTIVE" && b.status !== "INACTIVE") {
      return { error: "Invalid status." };
    }
    data.status = b.status;
  }
  if (b.departmentId !== undefined) {
    const v = typeof b.departmentId === "string" ? b.departmentId.trim() : "";
    if (!v) return { error: "Department can't be empty." };
    data.departmentId = v;
  }
  // Any `programId` in the body is ignored outright rather than parsed — staff
  // carry no award, so there is nothing for it to mean.
  if (b.roleIds !== undefined) {
    if (!Array.isArray(b.roleIds)) return { error: "Roles must be a list." };
    const ids = [...new Set(
      b.roleIds
        .filter((r): r is string => typeof r === "string" && r.trim() !== "")
        .map((r) => r.trim()),
    )];
    if (ids.length === 0) return { error: "A faculty member needs at least one role." };
    data.roleIds = ids;
  }

  if (Object.keys(data).length === 0) return { error: "Nothing to update." };
  return { data };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Faculty");
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const parsed = parsePatchBody(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    const existing = await db.facultyProfile.findUnique({
      where: { id },
      select: {
        departmentId: true,
        user: { select: { id: true, firebaseUid: true, email: true } },
      },
    });
    if (!existing) return Response.json({ error: "Faculty not found." }, { status: 404 });
    // Employment axis — you may edit staff YOUR department employs.
    authorize(ctx, "manage", "Faculty", { departmentId: existing.departmentId });

    // displayName lives on User, not FacultyProfile — it must be pulled out here
    // alongside the other User-side fields, or it would be spread into the
    // profile update as an unknown column and throw.
    const { status, departmentId, displayName, email, dateOfBirth, roleIds, ...facultyFields } =
      parsed.data;
    // Only a real change is worth a Firebase round-trip (and a rollback risk).
    const emailChanged = email !== undefined && email !== existing.user.email;

    // Moving them between departments — the ONLY move there is, now that a staff
    // account carries no award. The target must exist, be active, and be one you
    // may act in (the department they're LEAVING was checked above).
    if (departmentId !== undefined) {
      authorize(ctx, "manage", "Faculty", { departmentId });

      const dept = await validateDepartment(departmentId);
      if ("error" in dept) return Response.json({ error: dept.error }, { status: 400 });
    }

    // Reassigning roles (e.g. HOD rotation): validate they're assignable first.
    let validRoleIds: string[] | undefined;
    if (roleIds !== undefined) {
      const roleCheck = await validateAssignableRoles(roleIds, ctx);
      if ("error" in roleCheck) return Response.json({ error: roleCheck.error }, { status: 400 });
      validRoleIds = roleCheck.ok;
    }

    // User-side fields (display name, login status, credential) vs profile fields.
    // No programId: staff carry no award, and the scoping key (departmentId) lives
    // on FacultyProfile, so it is written with the profile below.
    const userData: {
      status?: "ACTIVE" | "INACTIVE";
      displayName?: string;
      email?: string;
    } = {};
    if (status) userData.status = status;
    if (displayName !== undefined) userData.displayName = displayName;
    if (email !== undefined) userData.email = email;

    // Keep the User (status/roles) and the profile in sync (atomic), then map.
    let updated;
    try {
      updated = await db.$transaction(async (tx) => {
        if (Object.keys(userData).length > 0) {
          await tx.user.update({ where: { id: existing.user.id }, data: userData });
        }
        // Role reassignment = replace the whole set (delete then recreate).
        if (validRoleIds) {
          await tx.userRole.deleteMany({ where: { userId: existing.user.id } });
          await tx.userRole.createMany({
            data: validRoleIds.map((roleId) => ({ userId: existing.user.id, roleId })),
          });
        }
        // Moving someone INTO a department they were only visiting makes that
        // attachment meaningless — it would read as a live "CSE → CSE" loan in the
        // admin list, the exact row POST /api/faculty/attachments refuses to
        // create. Drop it in the same transaction so the invariant can't be walked
        // around through the back door.
        if (departmentId !== undefined) {
          await tx.facultyAttachment.deleteMany({ where: { facultyId: id, departmentId } });
        }
        return tx.facultyProfile.update({
          where: { id },
          data: {
            ...facultyFields,
            // Employment lives on the profile, so a department move is written here
            // — in the same transaction as the User-side program change above, or
            // the two halves could disagree.
            ...(departmentId !== undefined ? { departmentId } : {}),
            ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
          },
          include: FACULTY_INCLUDE,
        });
      });
    } catch (e) {
      // staffId and email are both @unique. Name the clashing field — both are
      // visible in the same dialog, so "already in use" alone isn't actionable.
      if (isUniqueViolation(e)) {
        const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? "");
        return Response.json(
          {
            error: target.includes("staffId")
              ? "That staff ID is already in use."
              : target.includes("email")
                ? "That email is already in use."
                : "Staff ID or email is already in use.",
          },
          { status: 409 },
        );
      }
      throw e;
    }

    // Firebase is updated only AFTER Neon commits, because it's the side we can't
    // roll back transactionally. Faculty authenticate on this address directly,
    // so a divergence locks them out — put the Neon email back if Firebase
    // rejects it (most often auth/email-already-exists).
    if (emailChanged) {
      try {
        await updateFirebaseEmail(existing.user.firebaseUid, email!);
      } catch (e) {
        await db.user.update({
          where: { id: existing.user.id },
          data: { email: existing.user.email },
        });
        invalidateAuthUser(existing.user.firebaseUid);
        const code = (e as { code?: string }).code ?? "";
        return Response.json(
          {
            error:
              code === "auth/email-already-exists"
                ? "That email is already registered to another account. The email was left unchanged."
                : "Couldn't update the sign-in email. The email was left unchanged.",
          },
          { status: 409 },
        );
      }
    }

    // A login enable/disable, DEPARTMENT move, role change OR an identity change
    // alters authorization — reflect it immediately instead of waiting out the
    // auth-cache TTL. The department move matters most: it is the scoping key, so
    // without this the lecturer would keep their old department's reach for 30s.
    if (status || departmentId !== undefined || validRoleIds || emailChanged) {
      invalidateAuthUser(existing.user.firebaseUid);
    }

    return Response.json(toFacultyDto(updated));
  } catch (err) {
    return toAuthResponse(err);
  }
}
