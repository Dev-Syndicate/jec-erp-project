// GET /api/attendance/report?classId= — the attendance percentages for a class
// in the ACTIVE semester. This is why attendance is two tables:
//   - overall %  from MasterAttendance (the official day record)
//   - per-subject %  from PeriodAttendance (hour-wise, subject-level)
// PRESENT and OD count as attended; ABSENT and EXCUSED don't.
//
// Authorization: this is the WHOLE-CLASS report (every student's %), so it needs
// `mark Attendance` — the staff capability (SA/HOD/Faculty), NOT plain `read
// Attendance`, which the Student role also holds (for a future self-view). Gating
// the class report on `read` would let any enrolled student pull their whole
// class's records. Program-scoped on the class's program.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertTeachesOrAdvises } from "../access";
import { roman } from "../dto";

export const dynamic = "force-dynamic";

type Status = "PRESENT" | "ABSENT" | "OD" | "EXCUSED";
const isAttended = (s: Status) => s === "PRESENT" || s === "OD";
const pct = (attended: number, total: number) => (total > 0 ? Math.round((attended / total) * 100) : null);

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "mark", "Attendance");

    const classId = new URL(req.url).searchParams.get("classId")?.trim();
    if (!classId) return Response.json({ error: "Select a class." }, { status: 400 });

    const klass = await db.class.findUnique({
      where: { id: classId },
      include: { program: { include: { degree: true, branch: true } } },
    });
    if (!klass) return Response.json({ error: "Class not found." }, { status: 404 });
    authorize(ctx, "mark", "Attendance", { programId: klass.programId });

    const semester = await db.semester.findFirst({
      where: { isActive: true },
      include: { academicYear: { select: { name: true } } },
    });
    if (!semester) {
      return Response.json(
        { error: "No academic semester is active." },
        { status: 400 },
      );
    }

    // A program-scoped Faculty may only see reports for a class they teach or
    // advise; HOD/SA (manage Attendance) can see any class in program scope.
    await assertTeachesOrAdvises(ctx, classId, klass.advisorId, semester.id);

    // Roster: students enrolled in this class for the active year.
    const enrollments = await db.enrollment.findMany({
      where: { classId, academicYear: { isActive: true } },
      include: {
        student: { select: { id: true, registerNumber: true, user: { select: { displayName: true } } } },
      },
      orderBy: { student: { registerNumber: "asc" } },
    });

    // Overall: count master rows per (student, status) for the semester.
    const master = await db.masterAttendance.groupBy({
      by: ["studentId", "status"],
      where: { classId, semesterId: semester.id },
      _count: { _all: true },
    });
    const overallByStudent = new Map<string, Record<Status, number>>();
    for (const row of master) {
      const rec = overallByStudent.get(row.studentId) ?? { PRESENT: 0, ABSENT: 0, OD: 0, EXCUSED: 0 };
      rec[row.status as Status] = row._count._all;
      overallByStudent.set(row.studentId, rec);
    }

    // Per-subject: count period rows per (student, subject, status).
    const period = await db.periodAttendance.groupBy({
      by: ["studentId", "subjectId", "status"],
      where: { classId, semesterId: semester.id },
      _count: { _all: true },
    });
    // studentId -> subjectId -> { attended, total }
    const subjByStudent = new Map<string, Map<string, { attended: number; total: number }>>();
    const subjectIds = new Set<string>();
    for (const row of period) {
      subjectIds.add(row.subjectId);
      const perStudent = subjByStudent.get(row.studentId) ?? new Map();
      const cell = perStudent.get(row.subjectId) ?? { attended: 0, total: 0 };
      cell.total += row._count._all;
      if (isAttended(row.status as Status)) cell.attended += row._count._all;
      perStudent.set(row.subjectId, cell);
      subjByStudent.set(row.studentId, perStudent);
    }

    // Subject columns (code/name), ordered by code.
    const subjectsMeta = (
      await db.subject.findMany({
        where: { id: { in: [...subjectIds] } },
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      })
    ).map((s) => ({ subjectId: s.id, code: s.code, name: s.name }));

    const students = enrollments.map((e) => {
      const o = overallByStudent.get(e.student.id) ?? { PRESENT: 0, ABSENT: 0, OD: 0, EXCUSED: 0 };
      const total = o.PRESENT + o.ABSENT + o.OD + o.EXCUSED;
      const attended = o.PRESENT + o.OD;
      const perStudent = subjByStudent.get(e.student.id);
      return {
        studentId: e.student.id,
        registerNumber: e.student.registerNumber,
        displayName: e.student.user.displayName,
        overall: {
          present: o.PRESENT,
          absent: o.ABSENT,
          od: o.OD,
          excused: o.EXCUSED,
          total,
          attended,
          pct: pct(attended, total),
        },
        subjects: subjectsMeta.map((s) => {
          const cell = perStudent?.get(s.subjectId) ?? { attended: 0, total: 0 };
          return { subjectId: s.subjectId, attended: cell.attended, total: cell.total, pct: pct(cell.attended, cell.total) };
        }),
      };
    });

    return Response.json({
      classId,
      classLabel: `${klass.program.degree.code} · ${klass.program.branch.code} · ${roman(klass.year)}-${klass.section}`,
      semesterLabel: `${semester.academicYear.name} · ${semester.kind === "ODD" ? "Odd" : "Even"}`,
      subjectsMeta,
      students,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
