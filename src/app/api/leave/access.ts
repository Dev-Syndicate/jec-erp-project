// Leave/OD authorization — the two-stage approval scope on top of the RBAC caps.
//
// The workflow is student -> class teacher (stage 1) -> HOD (stage 2) -> issued.
// A single `approve Leave` grant covers both approver roles; WHICH stage a user may
// act on is decided here by their relationship to the request's class:
//   - Stage 1 (PENDING_TEACHER): the class's advisor, OR a department admin
//     (`manage Attendance` — HOD/SA can always act).
//   - Stage 2 (PENDING_HOD): a department admin for the department that OWNS the
//     class (HOD/SA).
// This mirrors the "advisor owns the class, HOD owns the department" model already
// in attendance/roster. Stage 2 follows the OWNER, not the award: a first-year
// class is run by S&H, so its final approval is the S&H HOD's — the same person
// who oversees its attendance and marks.
import "server-only";

import { AuthError, can, type AuthContext } from "@/lib/auth";

// A department admin for marks/attendance/leave purposes: `manage Attendance` in
// the scope of the department that OWNS the class (HOD in-department, Super Admin
// everywhere). `Attendance` and `Leave` both sit on the department axis, so a
// `{ programId }` resource here would match no grant and fail closed.
function isDepartmentAdmin(ctx: AuthContext, departmentId: string | null): boolean {
  return can(ctx, "manage", "Attendance", { departmentId });
}

/**
 * May this user act on STAGE 1 (class-teacher approval) of a request for this
 * class? STRICTLY the class advisor — the HOD does NOT get to shortcut the
 * teacher's stage (the two-stage order is the point). Super Admin (`manage all`)
 * is the only institution-level override. Throws 403 otherwise.
 */
export function assertCanTeacherAct(
  ctx: AuthContext,
  klass: { departmentId: string; advisorId: string | null },
): void {
  if (klass.advisorId && klass.advisorId === ctx.user.id) return; // the class teacher
  if (ctx.ability.can("manage", "all")) return; // Super Admin override only
  throw new AuthError(403, "Only the class teacher can approve this first stage.");
}

/**
 * May this user act on STAGE 2 (HOD approval)? A department admin for the
 * department that OWNS the class only — the class teacher's job ended at stage 1.
 * Throws 403 otherwise.
 *
 * Scoped on the owner rather than the award, so a first-year's final approval goes
 * to the S&H HOD who actually runs the class, not the branch HOD who merely awards
 * the degree. One consistent rule: whoever owns the class owns everything about it.
 */
export function assertCanHodAct(
  ctx: AuthContext,
  klass: { departmentId: string; advisorId: string | null },
): void {
  if (isDepartmentAdmin(ctx, klass.departmentId)) return;
  throw new AuthError(403, "Only the HOD (or an admin) can give final approval.");
}

/**
 * The classes whose STAGE-1 queue this user may see: the classes they advise. A
 * department admin sees every class their department owns instead (handled in the
 * route via isInstitutionScoped / departmentId), so this is only the advisor path.
 */
export function isProgramAdminForList(ctx: AuthContext): boolean {
  // List scoping: an admin (manage Attendance, unscoped or in-department) sees the
  // department's requests; a plain faculty sees only classes they advise.
  return ctx.ability.can("manage", "Attendance");
}

/**
 * Non-throwing "may this viewer act on this request AT ITS CURRENT STAGE?" — the
 * single source of truth the route uses to (a) set the DTO's `actionable` flag and
 * (b) the action handler uses via the assert* pair. Mirrors the stage rules:
 *   PENDING_TEACHER → the class advisor (or Super Admin)
 *   PENDING_HOD     → a department admin (HOD / Super Admin) for the department
 *                     that OWNS the class — year-1 is S&H-owned, so S&H's HOD
 * Everything else (APPROVED/REJECTED) → not actionable.
 */
export function canActOnStage(
  ctx: AuthContext,
  request: { status: string; class: { departmentId: string; advisorId: string | null } },
): boolean {
  if (request.status === "PENDING_TEACHER") {
    if (request.class.advisorId && request.class.advisorId === ctx.user.id) return true;
    return ctx.ability.can("manage", "all"); // Super Admin override only
  }
  if (request.status === "PENDING_HOD") {
    // Must agree with assertCanHodAct — this only sets the DTO's `actionable`
    // flag, the assert is the real gate.
    return isDepartmentAdmin(ctx, request.class.departmentId);
  }
  return false;
}
