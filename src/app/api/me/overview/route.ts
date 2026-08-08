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
import {
  ASSESSMENTS,
  COMPONENT_LABEL,
  COMPONENT_MAX,
  assessmentTotal,
  componentsOf,
  type Assessment,
  type Component,
} from "@/app/api/marks/scheme";

export const dynamic = "force-dynamic";

// Today's date at UTC midnight — matches Prisma's @db.Date storage, so the
// WorkingDay lookup below compares like with like.
function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

// getUTCDay(): 0=Sun … 6=Sat. Sun/Sat have no grid of their own — a working
// Saturday's weekday comes from the WorkingDay row, not from this table.
const DOW_TO_WEEKDAY = [null, "MON", "TUE", "WED", "THU", "FRI", null] as const;

type Status = "PRESENT" | "ABSENT" | "OD" | "EXCUSED";
const isAttended = (s: Status) => s === "PRESENT" || s === "OD";
const pct = (attended: number, total: number) => (total > 0 ? Math.round((attended / total) * 100) : null);

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);

    // Resolve THIS user's student record (+ current-year class/program).
    // Joined rather than fanned out — see the note on the parallel block below.
    const student = await db.student.findUnique({
      relationLoadStrategy: "join",
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
        // No class means no grid to run, whatever day it is.
        today: { weekday: null, followsDay: null },
      });
    }

    const semesterId = semester.id;
    const studentId = student.id;
    const today = todayUtc();
    const isSaturday = today.getUTCDay() === 6;

    // The four reads below are independent of each other, so they go out together
    // rather than one after another. Each round-trip to Neon costs ~90ms, so
    // sequential awaits here cost ~4x what the queries themselves need.
    const [master, period, slots, marks, workingSaturday] = await Promise.all([
      // --- Attendance: overall (MasterAttendance) + per-subject (PeriodAttendance).
      db.masterAttendance.groupBy({
        by: ["status"],
        where: { studentId, semesterId },
        _count: { _all: true },
      }),
      db.periodAttendance.groupBy({
        by: ["subjectId", "status"],
        where: { studentId, semesterId },
        _count: { _all: true },
      }),
      // --- Timetable: the student's class grid for the active semester.
      db.timetableSlot.findMany({
        relationLoadStrategy: "join",
        where: { classId: klass.id, semesterId },
        include: {
          subject: { select: { code: true, name: true } },
          faculty: { select: { displayName: true } },
        },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
      }),
      // --- Marks: the student's internal marks this semester, grouped by subject.
      db.internalMark.findMany({
        relationLoadStrategy: "join",
        where: { studentId, semesterId },
        include: { subject: { select: { id: true, code: true, name: true } } },
        orderBy: [{ subject: { code: "asc" } }, { assessment: "asc" }],
      }),
      // --- Is TODAY a declared working Saturday, and whose grid does it run?
      // The client can't answer this from the date alone, and without it a
      // student on a working Saturday is told it's the weekend. Only Saturdays
      // can have a row, so this is skipped the rest of the week.
      isSaturday ? db.workingDay.findUnique({ where: { date: today }, select: { followsDay: true } }) : null,
    ]);

    const overallCounts: Record<Status, number> = { PRESENT: 0, ABSENT: 0, OD: 0, EXCUSED: 0 };
    for (const row of master) overallCounts[row.status as Status] = row._count._all;
    const overallTotal =
      overallCounts.PRESENT + overallCounts.ABSENT + overallCounts.OD + overallCounts.EXCUSED;
    const overallAttended = overallCounts.PRESENT + overallCounts.OD;

    const perSubject = new Map<string, { attended: number; total: number }>();
    for (const row of period) {
      const cell = perSubject.get(row.subjectId) ?? { attended: 0, total: 0 };
      cell.total += row._count._all;
      if (isAttended(row.status as Status)) cell.attended += row._count._all;
      perSubject.set(row.subjectId, cell);
    }

    // Subject metadata for the per-subject attendance rows (code/name), ordered.
    // This one genuinely depends on the period-attendance result above, so it
    // stays a second stage rather than joining the parallel batch.
    const subjectIds = [...perSubject.keys()];
    const subjectsMeta = subjectIds.length
      ? await db.subject.findMany({
          where: { id: { in: subjectIds } },
          select: { id: true, code: true, name: true },
          orderBy: { code: "asc" },
        })
      : [];

    // Group marks by subject, then by ASSESSMENT — not as a flat list of rows.
    //
    // The DB stores one row per COMPONENT (IA1 = five rows: two cycle tests, two
    // assignments, the IAT exam). Sending those raw made the student portal show
    // ten undifferentiated chips labelled with enum keys, where "6/10" and
    // "40/60" carried equal weight and nothing said the parts summed to 100.
    // The shape below mirrors what the staff entry grid already receives: the
    // scheme is resolved SERVER-SIDE (scheme.ts is server-only, and it is the
    // single source of truth for labels and maximums), so the client never
    // hard-codes the college's marking scheme in a second place.
    const byComponent = new Map<string, Map<string, number>>();
    const subjectMeta = new Map<string, { code: string; name: string }>();
    for (const m of marks) {
      const row = byComponent.get(m.subjectId) ?? new Map<string, number>();
      row.set(m.assessment, Number(m.obtained));
      byComponent.set(m.subjectId, row);
      subjectMeta.set(m.subjectId, { code: m.subject.code, name: m.subject.name });
    }

    const marksBySubject = [...byComponent.entries()]
      .map(([subjectId, row]) => {
        const meta = subjectMeta.get(subjectId)!;
        const assessments = ASSESSMENTS.map((a: Assessment) => {
          const parts = componentsOf(a).map((c: Component) => ({
            key: c,
            label: COMPONENT_LABEL[c],
            max: COMPONENT_MAX[c],
            // null = not entered yet. Distinct from 0, which is a real zero.
            obtained: row.has(c) ? row.get(c)! : null,
          }));
          const entered = parts.filter((p) => p.obtained !== null);
          return {
            key: a,
            // Out of 100 for every assessment, derived rather than assumed.
            max: assessmentTotal(a),
            parts,
            // The total is summed on READ and never stored, so a corrected
            // component can't leave a stale total behind. Null until at least
            // one part exists — a half-entered assessment must not read as a
            // low score.
            obtained: entered.length ? entered.reduce((s, p) => s + p.obtained!, 0) : null,
            // Partial marking is normal mid-term; the UI says so rather than
            // implying the student scored the missing parts as zero.
            complete: entered.length === parts.length,
          };
        }).filter((a) => a.obtained !== null);
        return { subjectId, code: meta.code, name: meta.name, assessments };
      })
      .filter((s) => s.assessments.length > 0)
      .sort((a, b) => a.code.localeCompare(b.code));

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
      marks: marksBySubject,
      // Which weekday's grid TODAY runs, resolved server-side (the client only
      // knows the calendar date). Mon–Fri run as themselves; a declared working
      // Saturday runs the weekday an admin set; Sunday and an undeclared
      // Saturday are null = no classes. `followsDay` is set only on a working
      // Saturday, so the UI can say which day is being borrowed.
      today: {
        weekday: isSaturday
          ? (workingSaturday?.followsDay ?? null)
          : (DOW_TO_WEEKDAY[today.getUTCDay()] ?? null),
        followsDay: isSaturday ? (workingSaturday?.followsDay ?? null) : null,
      },
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
