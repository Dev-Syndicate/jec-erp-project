// Per-faculty internal-marks scoping — the resource-level check layered on top of
// the `enter Marks` capability. Two levels, deliberately different in width:
//
//   READ  marks — a marks admin (HOD/SA for the department that OWNS the class)
//                 OR the subject's teacher (assertReadsMarks). HODs keep
//                 oversight of results.
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
// Scope is enforced separately in the routes (the resource-form authorize against
// the class's OWNING departmentId — `Marks` sits on the department axis); this
// module adds the "which subject/class within that scope" layer.
import "server-only";

import { db } from "@/lib/db";
import { AuthError, can, type AuthContext } from "@/lib/auth";

/**
 * Is this user an institution/department admin for marks? True for `manage all`
 * (Super Admin) or an HOD whose department-scoped grants cover the department that
 * OWNS the class. The caller passes that departmentId so the scope condition is
 * honored.
 */
export function isMarksAdmin(ctx: AuthContext, departmentId: string | null): boolean {
  // Marks oversight follows the CLASS OWNER, not the subject catalogue. It used to
  // ask `manage Subject { programId }` — the award axis — which for a year-1 class
  // would hand oversight to the branch HOD whose award it is, while the class is
  // actually run by S&H. `manage Marks { departmentId }` puts it where the rest of
  // the class's authority already lives: whoever owns the class owns its results.
  // Faculty hold only `enter Marks` (and are confined to their own timetable
  // slots), so `manage Marks` still cleanly separates HOD/SA from plain teachers.
  return can(ctx, "manage", "Marks", { departmentId });
}

type SubjectTarget = {
  classId: string;
  subjectId: string;
  semesterId: string;
  // The department that OWNS the class — the axis `Marks` is scoped by. NOT the
  // subject's programId (that's the award, and is checked separately).
  departmentId: string | null;
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
 * Passes for a marks admin (HOD/SA for the department that OWNS the class) —
 * departmental oversight of results — or the subject's own teacher. Throws 403
 * otherwise.
 *
 * The class's departmentId drives the admin scope check: a year-1 class is owned
 * by S&H, so it is the S&H HOD who oversees its marks even though the award (and
 * the subject) is the branch's.
 */
export async function assertReadsMarks(ctx: AuthContext, args: SubjectTarget): Promise<void> {
  if (isMarksAdmin(ctx, args.departmentId)) return;
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
