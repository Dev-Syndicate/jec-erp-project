// Shared faculty DTO mapping — colocated with the routes (not a route.ts) and
// reused by the list + mutation handlers so every response matches the client
// type (src/features/faculty/types.ts). A faculty member is a Firebase-linked
// User + a FacultyProfile (HR detail); status lives on User (there is no
// separate lifecycle field like Student has).
import "server-only";

import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";

/**
 * Validate a set of role ids for assignment to a STAFF account. All must exist
 * and be assignable — i.e. PROGRAM-scoped and not the student-only "Student"
 * role (institution-scoped Super Admin is never hand-assigned).
 *
 * No privilege escalation: the actor may only confer a role whose permissions
 * they themselves hold. Otherwise an HOD (who has `manage Faculty`) could assign
 * a role carrying `manage Role` or other access they lack, minting a more
 * powerful account than themselves. Super Admin (`manage all`) can assign any
 * assignable role. Returns the de-duplicated ids on success, or a user-facing
 * error. Shared by the create + edit routes so both enforce the same rule.
 */
export async function validateAssignableRoles(
  roleIds: string[],
  ctx: AuthContext,
): Promise<{ ok: string[] } | { error: string }> {
  const ids = [...new Set(roleIds)];
  if (ids.length === 0) return { error: "Select at least one role." };

  const roles = await db.role.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      scope: true,
      permissions: { select: { permission: { select: { action: true, subject: true } } } },
    },
  });
  if (roles.length !== ids.length) return { error: "One or more roles no longer exist." };

  const bad = roles.find((r) => r.scope === "INSTITUTION" || r.name === "Student");
  if (bad) return { error: "That role can't be assigned to a faculty account." };

  // Subset rule — skipped for a full admin (manage/all).
  if (!ctx.ability.can("manage", "all")) {
    for (const role of roles) {
      const overreach = role.permissions.find(
        (rp) => !ctx.ability.can(rp.permission.action, rp.permission.subject),
      );
      if (overreach) {
        return {
          error: `You can't assign the "${role.name}" role — it grants access you don't have.`,
        };
      }
    }
  }

  return { ok: roles.map((r) => r.id) };
}

// The include that produces a faculty row with its department, user and roles.
// Pass to findMany/findUnique. No `program`: staff carry no award — the
// department is what scopes them (src/lib/auth.ts → scopesFor).
export const FACULTY_INCLUDE = {
  department: { select: { code: true, name: true } },
  user: {
    include: {
      roles: { include: { role: true } },
    },
  },
} as const;

/**
 * Validate the employing department of a staff account: it must exist and be
 * active. This is the whole rule now — a staff account is scoped by WHO EMPLOYS
 * THEM and nothing else, so there is no second half to reconcile.
 *
 * It can't live in the body parser because it depends on DB facts the parser
 * can't see (does the department exist? is it still active?), and it must run
 * BEFORE any Firebase identity is created: a clean 400 beats a provisioning
 * failure after the account already exists on the auth side.
 */
export async function validateDepartment(
  departmentId: string,
): Promise<{ ok: true } | { error: string }> {
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { name: true, isActive: true },
  });
  if (!department) return { error: "Select a valid department." };
  if (!department.isActive) return { error: `${department.name} is not an active department.` };

  return { ok: true };
}

type FacultyRow = {
  id: string;
  userId: string;
  departmentId: string;
  department: { code: string; name: string };
  staffId: string;
  designation: string;
  phone: string;
  emergencyPhone: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth: Date | null;
  maritalStatus: "SINGLE" | "MARRIED" | "OTHER" | null;
  fatherName: string | null;
  motherName: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    email: string;
    displayName: string;
    status: "ACTIVE" | "INACTIVE";
    mustChangePassword: boolean;
    roles: Array<{ role: { name: string } }>;
  };
};

export function toFacultyDto(f: FacultyRow) {
  return {
    id: f.id,
    userId: f.userId,
    // Who employs them — the ONLY thing that scopes a staff account. There is
    // deliberately no program here: a faculty member's User.programId grants
    // nothing (src/lib/auth.ts → scopesFor reads the department), so shipping it
    // would only invite the client to act on a fact that means nothing.
    departmentId: f.departmentId,
    departmentCode: f.department.code,
    departmentName: f.department.name,
    staffId: f.staffId,
    designation: f.designation,
    displayName: f.user.displayName,
    email: f.user.email,
    phone: f.phone,
    emergencyPhone: f.emergencyPhone,
    gender: f.gender,
    dateOfBirth: f.dateOfBirth,
    maritalStatus: f.maritalStatus,
    fatherName: f.fatherName,
    motherName: f.motherName,
    status: f.user.status,
    mustChangePassword: f.user.mustChangePassword,
    roles: f.user.roles.map((r) => r.role.name),
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}
