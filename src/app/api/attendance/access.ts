// Per-faculty attendance scoping — the resource-level check that layers on top of
// the `mark Attendance` capability. Three levels, deliberately different in width:
//
//   VIEW a class        — `manage Attendance` (HOD/SA), the class advisor, or
//                         anyone teaching ≥1 period in it (assertTeachesOrAdvises)
//   CORRECT the DAY row — `manage Attendance` or the class advisor
//                         (assertOwnsDayRecord)
//   MARK a PERIOD       — the period's own teacher, or a substitute assigned for
//                         that exact date (canMarkPeriod). No ROLE overrides it,
//                         not even Super Admin.
//
// The last one is the strict one: a subject hour is signed by whoever taught it, so
// nobody marks a register in another teacher's name. Covering an absent teacher is
// therefore an explicit, auditable GRANT (SlotSubstitution: who covers, which date,
// who arranged it) rather than a role that can reach into anyone's hours — and
// PeriodAttendance.markedById still records who actually marked.
//
// Department scope is enforced separately in the routes (assertInClassDepartment
// below); this module adds the "which class within the department" layer.
import "server-only";

import { db } from "@/lib/db";
import { AuthError, authorize, type AuthContext } from "@/lib/auth";

/**
 * Department-level gate: may this user work with attendance for a class owned by
 * `departmentId` at all?
 *
 * This exists because the plain scoped `authorize(ctx, "mark", "Attendance",
 * { departmentId })` is ATTACHMENT-BLIND. A lecturer's CASL condition is built
 * from `FacultyProfile.departmentId` alone (lib/auth.ts → scopesFor), so an S&H
 * lecturer attached to CSE — whom the timetable happily accepts and the class
 * picker happily offers — was rejected here, BEFORE reaching canMarkPeriod, which
 * would have granted them the hour. The same 403 hit any substitute employed by a
 * different department, contradicting the substitutions route that had just
 * validated them with the attachment-aware helper.
 *
 * So: pass the CASL check (employed here, or an unscoped admin), OR hold a
 * timetable slot in this class, OR be covering a period in it on this date. The
 * last two are what an attachment actually manifests as — we check the SLOT rather
 * than re-reading the attachment, so a lapsed attachment still lets the teacher
 * mark the hours already on the grid, which is exactly the documented rollover
 * behaviour.
 *
 * This is deliberately COARSE. It only decides "may you be in this class's
 * attendance at all"; canMarkPeriod remains the strict per-period authority and
 * still lets nobody sign another teacher's register.
 */
export async function assertInClassDepartment(
  ctx: AuthContext,
  klass: { id: string; departmentId: string },
  semesterId: string,
  date?: Date,
): Promise<void> {
  try {
    authorize(ctx, "mark", "Attendance", { departmentId: klass.departmentId });
    return;
  } catch {
    // Not scoped to this department by employment — fall through to the
    // teaches-here checks below rather than refusing outright.
  }

  const teaches = await db.timetableSlot.findFirst({
    where: { classId: klass.id, semesterId, facultyId: ctx.user.id },
    select: { id: true },
  });
  if (teaches) return;

  if (date) {
    const covering = await db.slotSubstitution.findFirst({
      where: { date, substituteId: ctx.user.id, slot: { classId: klass.id, semesterId } },
      select: { id: true },
    });
    if (covering) return;
  }

  throw new AuthError(403, "You don't have permission to do this.");
}

/**
 * Read-level: may this user view/work with this class's attendance at all?
 * Passes for `manage Attendance`, the class advisor, anyone who teaches at
 * least one period in the class this semester, or a substitute covering a period
 * in it on `date`. Throws 403 otherwise.
 *
 * The substitute case matters: a covering teacher usually teaches nothing else in
 * that class, so without it they'd be refused here and never reach the period
 * check that actually grants them the hour. `date` is optional — callers with no
 * particular date (they exist) keep the teaches/advises behaviour.
 */
export async function assertTeachesOrAdvises(
  ctx: AuthContext,
  classId: string,
  advisorId: string | null,
  semesterId: string,
  date?: Date,
): Promise<void> {
  if (ctx.ability.can("manage", "Attendance")) return;
  if (advisorId && advisorId === ctx.user.id) return;
  const teaches = await db.timetableSlot.findFirst({
    where: { classId, semesterId, facultyId: ctx.user.id },
    select: { id: true },
  });
  if (teaches) return;
  if (date) {
    const covering = await db.slotSubstitution.findFirst({
      where: { date, substituteId: ctx.user.id, slot: { classId, semesterId } },
      select: { id: true },
    });
    if (covering) return;
  }
  throw new AuthError(403, "You can only work with attendance for a class you teach or advise.");
}

/**
 * Mark-level predicate: may this user mark THIS period, on THIS date? True for
 * the faculty on the period's timetable slot, or for a substitute explicitly
 * assigned to cover that slot on that date — **no ROLE overrides it**, HOD and
 * Super Admin included.
 *
 * That is stricter than the surrounding checks on purpose. `manage Attendance`
 * still lets a HOD VIEW any class in their program and correct the DAY record
 * (assertOwnsDayRecord), but marking a colleague's subject hour would put that
 * teacher's name on a register they never took. A HOD who needs an hour covered
 * assigns a substitute for that date — which is a recorded grant naming the
 * covering teacher, the date and the assigner — instead of marking it themselves.
 * The class advisor is likewise NOT special here: they own the day record, not
 * other teachers' hours.
 *
 * `substituteSlotIds` is the set of slot ids this user is covering ON THE DATE
 * BEING MARKED, resolved once per request (see substitutionsFor). It is a
 * parameter rather than a lookup so the GET can call this per period without a
 * query per period.
 *
 * The GET uses this per period to tell the UI which periods are editable, so the
 * grid never presents an hour the user can't save (avoiding an edit-then-403).
 */
export function canMarkPeriod(
  ctx: AuthContext,
  slotFacultyId: string,
  slotId: string,
  substituteSlotIds: ReadonlySet<string>,
): boolean {
  return slotFacultyId === ctx.user.id || substituteSlotIds.has(slotId);
}

/** The throwing form of {@link canMarkPeriod}, gating the POST. */
export function assertMarksPeriod(
  ctx: AuthContext,
  slotFacultyId: string,
  slotId: string,
  substituteSlotIds: ReadonlySet<string>,
): void {
  if (canMarkPeriod(ctx, slotFacultyId, slotId, substituteSlotIds)) return;
  throw new AuthError(
    403,
    "You can only mark attendance for a period you teach, or one you've been assigned to cover.",
  );
}

/**
 * The slot ids this user is covering on `date` — the substitution grants that
 * apply to this request. Resolved once and passed to canMarkPeriod/
 * assertMarksPeriod so neither needs a query of its own.
 *
 * Scoped to the caller: it only ever returns grants made TO them, so it cannot
 * widen anyone else's rights.
 */
export async function substitutionsFor(
  ctx: AuthContext,
  date: Date,
  slotIds: string[],
): Promise<Set<string>> {
  if (slotIds.length === 0) return new Set();
  const rows = await db.slotSubstitution.findMany({
    where: { date, substituteId: ctx.user.id, slotId: { in: slotIds } },
    select: { slotId: true },
  });
  return new Set(rows.map((r) => r.slotId));
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
