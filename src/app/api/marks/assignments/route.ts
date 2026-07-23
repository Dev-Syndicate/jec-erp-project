// GET /api/marks/assignments — the (class, subject) tuples the caller may enter
// internal marks for, in the ACTIVE semester. Drives the pickers on the marks
// screen so it never offers a combination the user would 403 on.
//
// Derived from the TIMETABLE: the timetable IS the teaching allocation, so the
// markable subjects are the DISTINCT (class, subject) a faculty teaches at least
// one period of this semester. A marks admin (HOD/Super Admin — `manage Subject`
// in program scope) gets every (class × subject) scheduled in program scope; a
// plain Faculty gets only their own. Always filtered to the one active semester.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMarksAdmin } from "../access";

export const dynamic = "force-dynamic";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "enter", "Marks");

    const semester = await db.semester.findFirst({
      where: { isActive: true },
      select: { id: true, kind: true, academicYear: { select: { name: true } } },
    });
    if (!semester) {
      return Response.json({ semester: null, assignments: [] });
    }

    // Admins see every scheduled (class × subject) in program scope; Faculty only
    // the ones they personally teach.
    const admin = isMarksAdmin(ctx, ctx.user.programId);
    const where = {
      semesterId: semester.id,
      ...(admin
        ? ctx.isInstitutionScoped
          ? {}
          : { class: { programId: ctx.user.programId ?? "__none__" } }
        : { facultyId: ctx.user.id }),
    };

    // One timetable row per (class, subject) — a subject sits in several periods, so
    // distinct collapses those to a single markable entry.
    const slots = await db.timetableSlot.findMany({
      where,
      distinct: ["classId", "subjectId"],
      include: {
        subject: { select: { id: true, name: true, code: true } },
        class: {
          include: { program: { include: { degree: true, branch: true } } },
        },
      },
      orderBy: [{ class: { year: "asc" } }, { class: { section: "asc" } }, { subject: { code: "asc" } }],
    });

    return Response.json({
      semester: {
        id: semester.id,
        kind: semester.kind,
        academicYear: semester.academicYear.name,
      },
      assignments: slots.map((s) => ({
        id: `${s.classId}::${s.subjectId}`,
        classId: s.classId,
        subjectId: s.subjectId,
        subjectCode: s.subject.code,
        subjectName: s.subject.name,
        classLabel: `${s.class.program.degree.code} · ${s.class.program.branch.code} · ${roman(s.class.year)}-${s.class.section}`,
        programId: s.class.programId,
      })),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
