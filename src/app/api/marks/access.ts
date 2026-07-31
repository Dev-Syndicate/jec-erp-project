// Per-faculty internal-marks scoping — the resource-level check layered on top of
// the `enter Marks` capability. Two levels, deliberately different in width:
//
//   READ  marks — a marks admin (HOD/SA in program scope) OR the subject's
//                 teacher (assertReadsMarks). HODs keep oversight of results.
//   ENTER marks — the subject's own teacher, FULL STOP (assertEntersMarks).
//                 No role overrides it, not even Super Admin.
//
// The write rule mirrors attendance's per-period gate: a mark is the judgement of
// whoever taught and assessed the subject, and `markedById` stamps the record, so
// nobody enters a result in another teacher's name. A subject changing hands means
// reassigning the timetable slot.
//
// The TIMETABLE is the source of who-teaches-what: building it IS the teaching
// allocation, so there's no separate FacultyAssignment step to keep in sync (that
// table exists in the schema but is intentionally unused). Same source the
// attendance mark-gate uses.
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

type SubjectTarget = {
  classId: string;
  subjectId: string;
  semesterId: string;
  programId: string | null;
};

/** Does this user teach ≥1 timetable period of this subject to this class? */
export async function teachesSubject(ctx: AuthContext, args: SubjectTarget): Promise<boolean> {
  const slot = await db.timetableSlot.findFirst({
    where: {
      facultyId: ctx.user.id,
      subjectId: args.subjectId,
      classId: args.classId,
      semesterId: args.semesterId,
    },
    select: { id: true },
  });
  return slot !== null;
}

/**
 * READ level: may this user look at marks for THIS (subject, class, semester)?
 * Passes for a marks admin (HOD/SA in program scope) — departmental oversight of
 * results — or the subject's own teacher. Throws 403 otherwise.
 *
 * The class's programId is used for the admin scope check, so pass a class that
 * belongs to the subject's program (the routes validate that pairing first).
 */
export async function assertReadsMarks(ctx: AuthContext, args: SubjectTarget): Promise<void> {
  if (isMarksAdmin(ctx, args.programId)) return;
  if (await teachesSubject(ctx, args)) return;
  throw new AuthError(403, "You can only view marks for a subject you teach this semester.");
}

/**
 * WRITE level: may this user ENTER marks for THIS (subject, class, semester)?
 * ONLY the faculty who teaches it — **no role overrides this**, HOD and Super
 * Admin included.
 *
 * Deliberately stricter than {@link assertReadsMarks}, and the mirror of
 * attendance's per-period rule: a mark is the judgement of whoever taught and
 * assessed the subject, so nobody records a result in another teacher's name
 * (`markedById` would then name someone who never saw the paper). If a subject
 * changes hands, reassign the timetable slot — explicit and auditable — rather
 * than entering marks on their behalf.
 */
export async function assertEntersMarks(ctx: AuthContext, args: SubjectTarget): Promise<void> {
  if (await teachesSubject(ctx, args)) return;
  throw new AuthError(403, "Only the subject's teacher can enter marks for it.");
}
