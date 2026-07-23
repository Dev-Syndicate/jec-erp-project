// Per-faculty internal-marks scoping — the resource-level check layered on top of
// the `enter Marks` capability. `manage Marks` doesn't exist as a distinct grant;
// program-wide authority comes from `manage all` (Super Admin) or the HOD's
// program-scoped grants. The coarse gate for a plain Faculty is the TIMETABLE:
// they may enter/read marks ONLY for a (subject, class, semester) they teach at
// least one period of this semester. Building the timetable IS the teaching
// allocation — there's no separate FacultyAssignment step to keep in sync (the
// FacultyAssignment table exists in the schema but is intentionally unused; the
// timetable is the single source of who-teaches-what). Same source the attendance
// mark-gate uses.
//
// Program scope is enforced separately in the routes (the resource-form authorize
// against the class's programId); this module adds the "which subject/class within
// the program" layer.
import "server-only";

import { db } from "@/lib/db";
import { AuthError, can, type AuthContext } from "@/lib/auth";

/**
 * Is this user an institution/program admin for marks? True for `manage all`
 * (Super Admin) or an HOD whose program-scoped grants cover this program. The
 * caller passes the target programId so the HOD's scope condition is honored.
 */
export function isMarksAdmin(ctx: AuthContext, programId: string | null): boolean {
  // We model "marks admin" as: may enter marks for this program WITHOUT needing a
  // per-subject assignment. HOD holds `enter Marks` (program-scoped) AND manages
  // the subject catalog; Faculty holds `enter Marks` but is confined to their
  // assignments. `manage Subject` (program-scoped, or `manage all` for SA) cleanly
  // separates the two — only HOD/Super Admin have it.
  return can(ctx, "manage", "Subject", { programId });
}

/**
 * May this user enter/read marks for THIS (subject, class, semester)? Passes for a
 * marks admin (HOD/SA in program scope), or the faculty who teaches at least one
 * timetable period of this subject to this class this semester. Throws 403
 * otherwise.
 *
 * The class's programId is used for the admin scope check, so pass a class that
 * belongs to the subject's program (the routes validate that pairing first).
 */
export async function assertMarksSubject(
  ctx: AuthContext,
  args: { classId: string; subjectId: string; semesterId: string; programId: string | null },
): Promise<void> {
  if (isMarksAdmin(ctx, args.programId)) return;
  const teaches = await db.timetableSlot.findFirst({
    where: {
      facultyId: ctx.user.id,
      subjectId: args.subjectId,
      classId: args.classId,
      semesterId: args.semesterId,
    },
    select: { id: true },
  });
  if (!teaches) {
    throw new AuthError(403, "You can only enter marks for a subject you teach this semester.");
  }
}
