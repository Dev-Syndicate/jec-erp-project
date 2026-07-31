// GET /api/marks/assignments — the (class, subject) tuples the caller may enter
// internal marks for, in the ACTIVE semester. Drives the pickers on the marks
// screen so it never offers a combination the user would 403 on.
//
// Derived from the TIMETABLE: the timetable IS the teaching allocation, so the
// markable subjects are the DISTINCT (class, subject) a faculty teaches at least
// one period of this semester. A marks admin (HOD/Super Admin — `manage Subject`
// in program scope) gets every (class × subject) scheduled in program scope; a
// plain Faculty gets only their own. Always filtered to the one active semester.
//
// Each entry carries `canEnter`: an admin can READ any of their program's
// subjects but may only ENTER marks for one they personally teach, so the picker
// marks the rest as view-only instead of hiding them.
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

    // The (class, subject) pairs this viewer personally teaches — the set that is
    // actually editable. For a non-admin it equals the list above; for an admin it
    // is the subset of their program's subjects they teach themselves.
    const ownSlots = admin
      ? await db.timetableSlot.findMany({
          where: { semesterId: semester.id, facultyId: ctx.user.id },
          distinct: ["classId", "subjectId"],
          select: { classId: true, subjectId: true },
        })
      : slots.map((s) => ({ classId: s.classId, subjectId: s.subjectId }));
    const ownTaught = new Set(ownSlots.map((s) => `${s.classId}::${s.subjectId}`));

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
        // Year + section separately so the client can drill down Year → Section →
        // Subject instead of scrolling one flat list of every class × subject
        // (a HOD sees the whole department's, which is 20+ entries).
        year: s.class.year,
        section: s.class.section,
        programId: s.class.programId,
        // Only the subject's own teacher may enter marks. Computed from the
        // viewer's OWN slots, not this row's facultyId: `distinct` keeps one
        // arbitrary period per (class, subject), which for a co-taught subject
        // may belong to a different teacher and would wrongly read as false.
        canEnter: ownTaught.has(`${s.classId}::${s.subjectId}`),
      })),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
