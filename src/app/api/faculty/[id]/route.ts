// /api/faculty/[id] — edit a faculty member's detail fields, program + active
// status. Super-Admin only (program-scoped). params is a Promise in Next 16 —
// await it.
//
// staffId (college id) and email (Firebase identity) are NOT editable here.
// programId is the SCOPING KEY (lives on User): moving a faculty is allowed only
// within your scope (target checked too), and busts the auth cache. Setting
// status to INACTIVE disables the login (User.status = INACTIVE) so a departed
// faculty member can't sign in; reactivating restores it — also cache-busted so
// it takes effect immediately rather than after the TTL.
import { authenticate, assertProgramScope, invalidateAuthUser, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { FACULTY_INCLUDE, toFacultyDto, validateAssignableRoles } from "../dto";

export const dynamic = "force-dynamic";

type FacultyPatch = {
  displayName?: string;
  designation?: string;
  phone?: string;
  emergencyPhone?: string | null;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth?: string | null;
  maritalStatus?: "SINGLE" | "MARRIED" | "OTHER" | null;
  fatherName?: string | null;
  motherName?: string | null;
  status?: "ACTIVE" | "INACTIVE";
  programId?: string;
  roleIds?: string[];
};

function parsePatchBody(body: unknown): { data: FacultyPatch } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;
  const data: FacultyPatch = {};

  if (b.displayName !== undefined) {
    const v = typeof b.displayName === "string" ? b.displayName.trim() : "";
    if (!v) return { error: "Name can't be empty." };
    data.displayName = v;
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
  if (b.programId !== undefined) {
    const v = typeof b.programId === "string" ? b.programId.trim() : "";
    if (!v) return { error: "Program can't be empty." };
    data.programId = v;
  }
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
    requireRole(ctx, "Super Admin", "HOD");
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const parsed = parsePatchBody(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    const existing = await db.facultyProfile.findUnique({
      where: { id },
      include: { user: { select: { id: true, firebaseUid: true, programId: true } } },
    });
    if (!existing) return Response.json({ error: "Faculty not found." }, { status: 404 });
    assertProgramScope(ctx, existing.user.programId);

    const { status, programId, dateOfBirth, roleIds, ...facultyFields } = parsed.data;

    // Moving to another program: the target must exist and be within your scope
    // (a scoped user can't move a faculty into a program they don't own).
    if (programId !== undefined) {
      const program = await db.program.findUnique({ where: { id: programId }, select: { id: true } });
      if (!program) return Response.json({ error: "Select a valid program." }, { status: 400 });
      assertProgramScope(ctx, programId);
    }

    // Reassigning roles (e.g. HOD rotation): validate they're assignable first.
    let validRoleIds: string[] | undefined;
    if (roleIds !== undefined) {
      const roleCheck = await validateAssignableRoles(roleIds);
      if ("error" in roleCheck) return Response.json({ error: roleCheck.error }, { status: 400 });
      validRoleIds = roleCheck.ok;
    }

    // User-side fields (login status + scoping key) vs profile fields.
    const userData: { status?: "ACTIVE" | "INACTIVE"; programId?: string } = {};
    if (status) userData.status = status;
    if (programId !== undefined) userData.programId = programId;

    // Keep the User (status/program/roles) and the profile in sync (atomic), then map.
    const updated = await db.$transaction(async (tx) => {
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
      return tx.facultyProfile.update({
        where: { id },
        data: {
          ...facultyFields,
          ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
        },
        include: FACULTY_INCLUDE,
      });
    });

    // A login enable/disable, program move, OR role change alters authorization —
    // reflect it immediately instead of waiting out the auth-cache TTL.
    if (status || programId !== undefined || validRoleIds) {
      invalidateAuthUser(existing.user.firebaseUid);
    }

    return Response.json(toFacultyDto(updated));
  } catch (err) {
    return toAuthResponse(err);
  }
}
