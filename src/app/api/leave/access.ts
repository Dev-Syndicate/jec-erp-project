// Leave/OD authorization — the two-stage approval scope on top of the RBAC caps.
//
// The workflow is student -> class teacher (stage 1) -> HOD (stage 2) -> issued.
// A single `approve Leave` grant covers both approver roles; WHICH stage a user may
// act on is decided here by their relationship to the request's class:
//   - Stage 1 (PENDING_TEACHER): the class's advisor, OR a program admin
//     (`manage Attendance` — HOD/SA can always act).
//   - Stage 2 (PENDING_HOD): a program admin for the class's program (HOD/SA).
// This mirrors the "advisor owns the class, HOD owns the program" model already in
// attendance/roster.
import "server-only";

import { AuthError, can, type AuthContext } from "@/lib/auth";

// A program admin for marks/attendance/leave purposes: `manage Attendance` in the
// class's program scope (HOD in-program, Super Admin everywhere).
function isProgramAdmin(ctx: AuthContext, programId: string | null): boolean {
  return can(ctx, "manage", "Attendance", { programId });
}

/**
 * May this user act on STAGE 1 (class-teacher approval) of a request for this
 * class? STRICTLY the class advisor — the HOD does NOT get to shortcut the
 * teacher's stage (the two-stage order is the point). Super Admin (`manage all`)
 * is the only institution-level override. Throws 403 otherwise.
 */
export function assertCanTeacherAct(
  ctx: AuthContext,
  klass: { programId: string; advisorId: string | null },
): void {
  if (klass.advisorId && klass.advisorId === ctx.user.id) return; // the class teacher
  if (ctx.ability.can("manage", "all")) return; // Super Admin override only
  throw new AuthError(403, "Only the class teacher can approve this first stage.");
}

/**
 * May this user act on STAGE 2 (HOD approval)? A program admin for the class's
 * program only — the class teacher's job ended at stage 1. Throws 403 otherwise.
 */
export function assertCanHodAct(
  ctx: AuthContext,
  klass: { programId: string; advisorId: string | null },
): void {
  if (isProgramAdmin(ctx, klass.programId)) return;
  throw new AuthError(403, "Only the HOD (or an admin) can give final approval.");
}

/**
 * The classes whose STAGE-1 queue this user may see: the classes they advise. A
 * program admin sees the whole program instead (handled in the route via
 * isInstitutionScoped / programId), so this is only the advisor path.
 */
export function isProgramAdminForList(ctx: AuthContext): boolean {
  // List scoping: an admin (manage Attendance, unscoped or in-program) sees the
  // program's requests; a plain faculty sees only classes they advise.
  return ctx.ability.can("manage", "Attendance");
}

/**
 * Non-throwing "may this viewer act on this request AT ITS CURRENT STAGE?" — the
 * single source of truth the route uses to (a) set the DTO's `actionable` flag and
 * (b) the action handler uses via the assert* pair. Mirrors the stage rules:
 *   PENDING_TEACHER → the class advisor (or Super Admin)
 *   PENDING_HOD     → a program admin (HOD / Super Admin) for the class's program
 * Everything else (APPROVED/REJECTED) → not actionable.
 */
export function canActOnStage(
  ctx: AuthContext,
  request: { status: string; class: { programId: string; advisorId: string | null } },
): boolean {
  if (request.status === "PENDING_TEACHER") {
    if (request.class.advisorId && request.class.advisorId === ctx.user.id) return true;
    return ctx.ability.can("manage", "all"); // Super Admin override only
  }
  if (request.status === "PENDING_HOD") {
    return isProgramAdmin(ctx, request.class.programId);
  }
  return false;
}
