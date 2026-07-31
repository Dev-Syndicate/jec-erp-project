// Per-faculty attendance scoping — the resource-level check that layers on top of
// the `mark Attendance` capability. Three levels, deliberately different in width:
//
//   VIEW a class        — `manage Attendance` (HOD/SA), the class advisor, or
//                         anyone teaching ≥1 period in it (assertTeachesOrAdvises)
//   CORRECT the DAY row — `manage Attendance` or the class advisor
//                         (assertOwnsDayRecord)
//   MARK a PERIOD       — the period's own teacher, FULL STOP (canMarkPeriod).
//                         No role overrides this, not even Super Admin.
//
// The last one is the strict one: a subject hour is signed by whoever taught it, so
// nobody marks a register in another teacher's name. Covering an absent teacher
// means reassigning the timetable slot, which is explicit and auditable.
//
// Program scope is enforced separately in the routes (the resource-form authorize); this
// module adds the "which class within the program" layer.
import "server-only";

import { db } from "@/lib/db";
import { AuthError, type AuthContext } from "@/lib/auth";

/**
 * Read-level: may this user view/work with this class's attendance at all?
 * Passes for `manage Attendance`, the class advisor, or anyone who teaches at
 * least one period in the class this semester. Throws 403 otherwise.
 */
export async function assertTeachesOrAdvises(
  ctx: AuthContext,
  classId: string,
  advisorId: string | null,
  semesterId: string,
): Promise<void> {
  if (ctx.ability.can("manage", "Attendance")) return;
  if (advisorId && advisorId === ctx.user.id) return;
  const teaches = await db.timetableSlot.findFirst({
    where: { classId, semesterId, facultyId: ctx.user.id },
    select: { id: true },
  });
  if (!teaches) {
    throw new AuthError(403, "You can only work with attendance for a class you teach or advise.");
  }
}

/**
 * Mark-level predicate: may this user mark THIS period? A subject hour belongs to
 * the person who taught it, so this is true ONLY for the faculty on the period's
 * timetable slot — **no role overrides it**, HOD and Super Admin included.
 *
 * That is stricter than the surrounding checks on purpose. `manage Attendance`
 * still lets a HOD VIEW any class in their program and correct the DAY record
 * (assertOwnsDayRecord), but marking a colleague's subject hour would put that
 * teacher's name on a register they never took. Covering an absent teacher means
 * reassigning the timetable slot — an explicit, auditable act — rather than
 * silently marking on their behalf. The class advisor is likewise NOT special
 * here: they own the day record, not other teachers' hours.
 *
 * The GET uses this per period to tell the UI which periods are editable, so the
 * grid never presents an hour the user can't save (avoiding an edit-then-403).
 */
export function canMarkPeriod(ctx: AuthContext, slotFacultyId: string): boolean {
  return slotFacultyId === ctx.user.id;
}

/** The throwing form of {@link canMarkPeriod}, gating the POST. */
export function assertMarksPeriod(ctx: AuthContext, slotFacultyId: string): void {
  if (canMarkPeriod(ctx, slotFacultyId)) return;
  throw new AuthError(403, "You can only mark attendance for a period you teach.");
}

/**
 * Day-record level: may this user correct the official DAY (Master) attendance?
 * The day record is the class teacher's domain, so this is STRICTER than
 * assertTeachesOrAdvises — only `manage Attendance` (HOD/SA) or the class advisor
 * pass; a plain subject teacher can mark their period but not override the day
 * record. Throws 403 otherwise.
 */
export function assertOwnsDayRecord(ctx: AuthContext, advisorId: string | null): void {
  if (ctx.ability.can("manage", "Attendance")) return;
  if (advisorId && advisorId === ctx.user.id) return;
  throw new AuthError(403, "Only the class teacher (or an admin) can correct the day attendance.");
}
