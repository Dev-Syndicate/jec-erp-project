// Per-faculty attendance scoping — the resource-level check that layers on top of
// the `mark Attendance` capability. `manage Attendance` (HOD/Super Admin) works
// with any class in program scope; a plain `mark Attendance` holder (Faculty) is
// confined to a class they teach or advise, and — when marking — to the specific
// period they teach. The class advisor (class teacher) can VIEW the whole class and
// owns the DAY (Master) record (assertOwnsDayRecord), but period (subject) marking
// stays with each period's own teacher — the advisor is NOT a wildcard there.
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
 * Mark-level predicate: may this user mark THIS period? Period (subject) attendance
 * belongs to the subject teacher, so true ONLY for `manage Attendance` (HOD/SA — the
 * substitute/override valve) or the faculty assigned to this period's timetable
 * slot. The class advisor is deliberately NOT special here: they own the DAY
 * (Master) record (assertOwnsDayRecord), not other teachers' subject hours.
 *
 * The GET uses this per period to tell the UI which periods are editable, so the
 * grid never presents an hour the user can't save (avoiding an edit-then-403).
 */
export function canMarkPeriod(ctx: AuthContext, slotFacultyId: string): boolean {
  return ctx.ability.can("manage", "Attendance") || slotFacultyId === ctx.user.id;
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
