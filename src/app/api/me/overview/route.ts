// GET /api/me/overview — the signed-in STUDENT's own portal data: profile, their
// attendance % (overall + per-subject), their class timetable, and their internal
// marks, for the active semester.
//
// SELF-SCOPED BY CONSTRUCTION: it resolves the Student from ctx.user (the verified
// token's uid) and never accepts a studentId from the client, so a student can only
// ever see their own records (the leak we guard against — see the student-login
// quirk). A non-student account gets 403.
import { authenticate, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

type Status = "PRESENT" | "ABSENT" | "OD" | "EXCUSED";
const isAttended = (s: Status) => s === "PRESENT" || s === "OD";
const pct = (attended: number, total: number) => (total > 0 ? Math.round((attended / total) * 100) : null);

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);

    // Resolve THIS user's student record (+ current-year class/program).
    const student = await db.student.findUnique({
      where: { userId: ctx.user.id },
      include: {
        user: { select: { displayName: true, email: true } },
        enrollments: {
          where: { academicYear: { isActive: true } },
          include: {
            class: { include: { program: { include: { degree: true, branch: true } } } },
          },
          take: 1,
        },
      },
    });
    if (!student) {
      return Response.json({ error: "This isn't a student account." }, { status: 403 });
    }

    const enrollment = student.enrollments[0] ?? null;
    const klass = enrollment?.class ?? null;

    const profile = {
      registerNumber: student.registerNumber,
      rollNumber: student.rollNumber,
      displayName: student.user.displayName,
      email: student.user.email,
      phone: student.phone,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth,
      programLabel: klass ? `${klass.program.degree.code} · ${klass.program.branch.code}` : null,
      classLabel: klass ? `${roman(klass.year)}-${klass.section}` : null,
    };

    const semester = await db.semester.findFirst({
      where: { isActive: true },
      include: { academicYear: { select: { name: true } } },
    });

    // No class or no active semester → profile only (nothing time-bound to show).
    if (!klass || !semester) {
      return Response.json({
        profile,
        semesterLabel: semester
          ? `${semester.academicYear.name} · ${semester.kind === "ODD" ? "Odd" : "Even"}`
          : null,
        notEnrolled: !klass,
        attendance: { overall: null, subjects: [] },
        timetable: [],
        marks: [],
      });
    }

    const semesterId = semester.id;
    const studentId = student.id;

    // --- Attendance: overall (MasterAttendance) + per-subject (PeriodAttendance).
    const master = await db.masterAttendance.groupBy({
      by: ["status"],
      where: { studentId, semesterId },
      _count: { _all: true },
    });
    const overallCounts: Record<Status, number> = { PRESENT: 0, ABSENT: 0, OD: 0, EXCUSED: 0 };
    for (const row of master) overallCounts[row.status as Status] = row._count._all;
    const overallTotal =
      overallCounts.PRESENT + overallCounts.ABSENT + overallCounts.OD + overallCounts.EXCUSED;
    const overallAttended = overallCounts.PRESENT + overallCounts.OD;

    const period = await db.periodAttendance.groupBy({
      by: ["subjectId", "status"],
      where: { studentId, semesterId },
      _count: { _all: true },
    });
    const perSubject = new Map<string, { attended: number; total: number }>();
    for (const row of period) {
      const cell = perSubject.get(row.subjectId) ?? { attended: 0, total: 0 };
      cell.total += row._count._all;
      if (isAttended(row.status as Status)) cell.attended += row._count._all;
      perSubject.set(row.subjectId, cell);
    }

    // --- Timetable: the student's class grid for the active semester.
    const slots = await db.timetableSlot.findMany({
      where: { classId: klass.id, semesterId },
      include: {
        subject: { select: { code: true, name: true } },
        faculty: { select: { displayName: true } },
      },
      orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
    });

    // --- Marks: the student's internal marks this semester, grouped by subject.
    const marks = await db.internalMark.findMany({
      where: { studentId, semesterId },
      include: { subject: { select: { id: true, code: true, name: true } } },
      orderBy: [{ subject: { code: "asc" } }, { assessment: "asc" }],
    });

    // Subject metadata for the per-subject attendance rows (code/name), ordered.
    const subjectIds = [...perSubject.keys()];
    const subjectsMeta = subjectIds.length
      ? await db.subject.findMany({
          where: { id: { in: subjectIds } },
          select: { id: true, code: true, name: true },
          orderBy: { code: "asc" },
        })
      : [];

    // Group marks by subject.
    const marksBySubject = new Map<
      string,
      { subjectId: string; code: string; name: string; items: Array<{ assessment: string; obtained: number; maxMark: number }> }
    >();
    for (const m of marks) {
      const g =
        marksBySubject.get(m.subjectId) ??
        { subjectId: m.subjectId, code: m.subject.code, name: m.subject.name, items: [] };
      g.items.push({ assessment: m.assessment, obtained: Number(m.obtained), maxMark: Number(m.maxMark) });
      marksBySubject.set(m.subjectId, g);
    }

    return Response.json({
      profile,
      semesterLabel: `${semester.academicYear.name} · ${semester.kind === "ODD" ? "Odd" : "Even"}`,
      notEnrolled: false,
      attendance: {
        overall: {
          present: overallCounts.PRESENT,
          absent: overallCounts.ABSENT,
          od: overallCounts.OD,
          excused: overallCounts.EXCUSED,
          total: overallTotal,
          attended: overallAttended,
          pct: pct(overallAttended, overallTotal),
        },
        subjects: subjectsMeta.map((s) => {
          const cell = perSubject.get(s.id) ?? { attended: 0, total: 0 };
          return { subjectId: s.id, code: s.code, name: s.name, attended: cell.attended, total: cell.total, pct: pct(cell.attended, cell.total) };
        }),
      },
      timetable: slots.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        period: s.period,
        subjectCode: s.subject.code,
        subjectName: s.subject.name,
        facultyName: s.faculty.displayName,
      })),
      marks: [...marksBySubject.values()],
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
