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

// The include that produces a faculty row with its user, program and roles.
// Pass to findMany/findUnique.
export const FACULTY_INCLUDE = {
  department: { select: { code: true, name: true } },
  user: {
    include: {
      program: { include: { degree: true, branch: true } },
      roles: { include: { role: true } },
    },
  },
} as const;

type Deg = { code: string };
type Br = { code: string };
type ProgRel = { degree: Deg; branch: Br } | null;

/**
 * Validate the (department, program) pair for a staff account.
 *
 * The rule can't live in the body parser because it depends on a DB fact the
 * parser can't see: **does this department run any awards?**
 *
 *   - A department that runs awards requires one **of its own** — picking another
 *     department's program would strand the lecturer outside their own unit.
 *   - A department that runs none (S&H) requires **no** program, and REJECTS one
 *     rather than silently discarding it: a caller that sent a program has a
 *     different model of the world in mind and should be told so.
 *
 * Returns the resolved programId (or null) on success.
 */
export async function validateDepartmentAndProgram(
  departmentId: string,
  programId: string | null,
): Promise<{ ok: string | null } | { error: string }> {
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: {
      name: true,
      isActive: true,
      _count: { select: { programs: true } },
    },
  });
  if (!department) return { error: "Select a valid department." };
  if (!department.isActive) return { error: `${department.name} is not an active department.` };

  if (department._count.programs === 0) {
    if (programId) {
      return {
        error: `${department.name} runs no programs, so its staff aren't attached to one.`,
      };
    }
    return { ok: null };
  }

  if (!programId) return { error: "Program is required for this department." };

  const program = await db.program.findUnique({
    where: { id: programId },
    select: { departmentId: true },
  });
  if (!program) return { error: "Select a valid program." };
  if (program.departmentId !== departmentId) {
    return { error: `That program isn't run by ${department.name}.` };
  }

  return { ok: programId };
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
    programId: string | null;
    program: ProgRel;
    roles: Array<{ role: { name: string } }>;
  };
};

function programLabel(p: ProgRel): string | null {
  return p ? `${p.degree.code} · ${p.branch.code}` : null;
}

export function toFacultyDto(f: FacultyRow) {
  return {
    id: f.id,
    userId: f.userId,
    // Who employs them — the primary fact for staff. programLabel below is null
    // for a department that runs no award, so the roster leads with this.
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
    programId: f.user.programId,
    programLabel: programLabel(f.user.program),
    roles: f.user.roles.map((r) => r.role.name),
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}
