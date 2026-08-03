// /api/attendance — mark a class's attendance for one (date, period).
//
// GET  ?classId=&date=  → the marking context: the day's scheduled
//   periods (from the timetable for the effective weekday), the roster (students
//   enrolled in this class for the ACTIVE academic year), and any marks already
//   saved for that date (to prefill the grid).
// POST { classId, date, period, entries:[{studentId,status}] } →
//   upsert PeriodAttendance for each student. Marking period 1 ALSO upserts that
//   student's MasterAttendance with the same status (the official day record);
//   periods 2–8 only touch PeriodAttendance. (schema-design.html)
//
// Saturdays: the timetable is Mon–Fri, so a working Saturday borrows the weekday
// an ADMIN declared for that date (the WorkingDay table, via resolveWeekday) —
// not a weekday the caller picks, so every teacher marking that Saturday reads
// the same grid. An undeclared Saturday is a holiday and is refused. Records
// still key on the real `date`.
//
// Authorization: both GET and POST need `mark Attendance` — the staff capability
// (SA/HOD/Faculty). The GET returns the WHOLE-CLASS roster + everyone's marks, so
// it must NOT use plain `read Attendance`, which the Student role also holds (that
// grant is for a future per-student self-view, not the class roster). Both are
// program-scoped via a scoped authorize on the class's program.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  assertMarksPeriod,
  assertTeachesOrAdvises,
  canMarkPeriod,
  substitutionsFor,
} from "./access";
import { dayName, isStatus, parseDateOnly, resolveWeekday, roman } from "./dto";

export const dynamic = "force-dynamic";

// The single active semester (with its year name) — attendance records hang off
// it, and it defines which weekday grid the timetable lookup uses.
function activeSemester() {
  return db.semester.findFirst({
    where: { isActive: true },
    include: { academicYear: { select: { name: true } } },
  });
}

async function loadClass(classId: string) {
  return db.class.findUnique({
    where: { id: classId },
    include: { program: { include: { degree: true, branch: true } } },
  });
}

function classLabel(k: NonNullable<Awaited<ReturnType<typeof loadClass>>>): string {
  return `${k.program.degree.code} · ${k.program.branch.code} · ${roman(k.year)}-${k.section}`;
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "mark", "Attendance");

    const url = new URL(req.url);
    const classId = url.searchParams.get("classId")?.trim();
    const dateStr = url.searchParams.get("date")?.trim();

    if (!classId) return Response.json({ error: "Select a class." }, { status: 400 });
    if (!dateStr) return Response.json({ error: "Select a date." }, { status: 400 });

    const date = parseDateOnly(dateStr);
    if (!date) return Response.json({ error: "Invalid date." }, { status: 400 });

    const klass = await loadClass(classId);
    if (!klass) return Response.json({ error: "Class not found." }, { status: 404 });
    authorize(ctx, "mark", "Attendance", { programId: klass.programId });

    const day = await resolveWeekday(date);
    if ("error" in day) return Response.json({ error: day.error }, { status: 400 });

    const semester = await activeSemester();
    if (!semester) {
      return Response.json(
        { error: "No academic semester is active. Activate one before marking attendance." },
        { status: 400 },
      );
    }

    // A program-scoped Faculty may only view a class they teach or advise; HOD/SA
    // (manage Attendance) can view any class in program scope. A substitute
    // covering a period here on this date passes too — otherwise they'd be turned
    // away before reaching the hour they were assigned.
    await assertTeachesOrAdvises(ctx, classId, klass.advisorId, semester.id, date);

    // Periods, roster and saved marks are independent of one another — issued
    // together so the screen costs one round-trip's latency instead of three.
    // They run only AFTER the access check above, which is the ordering that
    // matters here.
    const [slots, enrollments, marks] = await Promise.all([
      // The day's scheduled periods for the effective weekday (Sat borrows one).
      db.timetableSlot.findMany({
        relationLoadStrategy: "join",
        where: { classId, semesterId: semester.id, dayOfWeek: day.weekday },
        include: { subject: { select: { code: true, name: true } }, faculty: { select: { displayName: true } } },
        orderBy: { period: "asc" },
      }),
      // Roster = students enrolled in this class for the active academic year.
      db.enrollment.findMany({
        relationLoadStrategy: "join",
        where: { classId, academicYear: { isActive: true } },
        include: {
          student: {
            select: {
              id: true,
              registerNumber: true,
              rollNumber: true,
              user: { select: { displayName: true } },
            },
          },
        },
        orderBy: { student: { registerNumber: "asc" } },
      }),
      // Marks already saved for this date (prefill the grid, per period).
      db.periodAttendance.findMany({
        where: { classId, date, semesterId: semester.id },
        select: { studentId: true, period: true, status: true },
      }),
    ]);

    // Covers arranged for this class on this date. Needs the slot ids, so it
    // follows the batch above rather than joining it.
    const covers = await db.slotSubstitution.findMany({
      relationLoadStrategy: "join",
      where: { date, slotId: { in: slots.map((s) => s.id) } },
      include: { substitute: { select: { id: true, displayName: true } } },
    });
    // The caller's own grants gate marking; the full list is display-only.
    const mySubstitutions = new Set(
      covers.filter((c) => c.substituteId === ctx.user.id).map((c) => c.slotId),
    );
    const coverBySlot = new Map(
      covers.map((c) => [
        c.slotId,
        { facultyId: c.substitute.id, facultyName: c.substitute.displayName, reason: c.reason },
      ]),
    );

    return Response.json({
      classId,
      classLabel: classLabel(klass),
      date: dateStr,
      weekday: day.weekday,
      // On a declared working Saturday, tell the client which weekday it runs so
      // the screen can state it. Absent on Mon–Fri, which run as themselves.
      ...(dayName(date) === "SAT" ? { followsDay: day.weekday } : {}),
      semesterId: semester.id,
      semesterLabel: `${semester.academicYear.name} · ${semester.kind === "ODD" ? "Odd" : "Even"}`,
      periods: slots.map((s) => ({
        period: s.period,
        subjectId: s.subjectId,
        subjectCode: s.subject.code,
        subjectName: s.subject.name,
        facultyId: s.facultyId,
        facultyName: s.faculty.displayName,
        // Whether THIS viewer may mark this period, so the UI locks the hours that
        // aren't theirs instead of letting them edit-then-403.
        canMark: canMarkPeriod(ctx, s.facultyId, s.id, mySubstitutions),
        // Set when someone is covering this hour today, so the grid can say who
        // is taking it instead of showing only the absent teacher's name.
        coveredBy: coverBySlot.get(s.id) ?? null,
      })),
      roster: enrollments.map((e) => ({
        studentId: e.student.id,
        registerNumber: e.student.registerNumber,
        rollNumber: e.student.rollNumber,
        displayName: e.student.user.displayName,
      })),
      marks,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "mark", "Attendance");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const classId = typeof body?.classId === "string" ? body.classId.trim() : "";
    const dateStr = typeof body?.date === "string" ? body.date.trim() : "";
    const period = body?.period;
    const rawEntries = Array.isArray(body?.entries) ? (body.entries as unknown[]) : null;

    if (!classId) return Response.json({ error: "Select a class." }, { status: 400 });
    if (!dateStr) return Response.json({ error: "Select a date." }, { status: 400 });
    const date = parseDateOnly(dateStr);
    if (!date) return Response.json({ error: "Invalid date." }, { status: 400 });
    if (typeof period !== "number" || !Number.isInteger(period) || period < 1 || period > 8) {
      return Response.json({ error: "Period must be 1–8." }, { status: 400 });
    }
    if (!rawEntries || rawEntries.length === 0) {
      return Response.json({ error: "No students to mark." }, { status: 400 });
    }

    // Validate + normalize entries.
    const entries: Array<{ studentId: string; status: string }> = [];
    for (const raw of rawEntries) {
      const e = raw as Record<string, unknown>;
      const studentId = typeof e?.studentId === "string" ? e.studentId.trim() : "";
      const status = e?.status;
      if (!studentId || !isStatus(status)) {
        return Response.json({ error: "Every row needs a student and a valid status." }, { status: 400 });
      }
      entries.push({ studentId, status });
    }

    const klass = await db.class.findUnique({
      where: { id: classId },
      select: { programId: true },
    });
    if (!klass) return Response.json({ error: "Class not found." }, { status: 404 });
    authorize(ctx, "mark", "Attendance", { programId: klass.programId });

    const day = await resolveWeekday(date);
    if ("error" in day) return Response.json({ error: day.error }, { status: 400 });

    const semester = await activeSemester();
    if (!semester) return Response.json({ error: "No academic semester is active." }, { status: 400 });

    // The period must be scheduled — that's where the subject for the record
    // comes from (a Saturday borrowing Monday records Monday's subject).
    const slot = await db.timetableSlot.findUnique({
      where: {
        classId_semesterId_dayOfWeek_period: {
          classId,
          semesterId: semester.id,
          dayOfWeek: day.weekday,
          period,
        },
      },
      select: { id: true, subjectId: true, facultyId: true },
    });
    if (!slot) {
      return Response.json(
        { error: "No class is scheduled for that period. Check the timetable." },
        { status: 400 },
      );
    }

    // The period's own teacher, or whoever was assigned to cover it on THIS date.
    // No role reaches into another teacher's hour — not the advisor, not HOD, not
    // Super Admin; a HOD who needs it covered assigns a substitute (see access.ts).
    const mySubstitutions = await substitutionsFor(ctx, date, [slot.id]);
    assertMarksPeriod(ctx, slot.facultyId, slot.id, mySubstitutions);

    // Every marked student must be on this class's active-year roster.
    const enrolled = await db.enrollment.findMany({
      where: { classId, academicYear: { isActive: true } },
      select: { studentId: true },
    });
    const rosterIds = new Set(enrolled.map((e) => e.studentId));
    const stray = entries.find((e) => !rosterIds.has(e.studentId));
    if (stray) {
      return Response.json({ error: "A marked student isn't enrolled in this class." }, { status: 400 });
    }

    const markedById = ctx.user.id;
    const subjectId = slot.subjectId;
    const semesterId = semester.id;

    // Upsert every student's period row; period 1 also stamps MasterAttendance.
    // NOTE ON SIZE: each op is a round-trip to Neon (Singapore). Marking a 60+
    // student class over a US-region serverless function means ~60 round-trips of
    // ~95ms each — a per-student updateMany loop for the master rows blew the 20s
    // interactive-transaction timeout on Vercel (worked locally only because the
    // DB was near). So the master write is collapsed to a handful of set-based
    // statements: one createMany + one updateMany PER DISTINCT STATUS (≤4), not
    // one per student.
    // Group students by the status being set — used for both the period and the
    // master writes so each becomes a fixed handful of set-based statements
    // regardless of class size.
    const byStatus = new Map<string, string[]>();
    for (const e of entries) {
      const ids = byStatus.get(e.status) ?? [];
      ids.push(e.studentId);
      byStatus.set(e.status, ids);
    }

    // Period rows: Prisma has no bulk upsert, so emulate it — createMany the
    // missing rows (skipDuplicates), then one updateMany per status group for the
    // rows that already existed. N students → ≤ (1 + 4) statements, not N upserts.
    const periodOps: Prisma.PrismaPromise<unknown>[] = [
      db.periodAttendance.createMany({
        data: entries.map((e) => ({
          studentId: e.studentId,
          subjectId,
          classId,
          semesterId,
          date,
          period,
          status: e.status as never,
          markedById,
        })),
        skipDuplicates: true,
      }),
    ];
    for (const [status, studentIds] of byStatus) {
      periodOps.push(
        db.periodAttendance.updateMany({
          where: { studentId: { in: studentIds }, date, period },
          data: { status: status as never, subjectId, markedById },
        }),
      );
    }
    // Period 1 seeds the official day record — but must NOT overwrite a row the
    // class teacher has manually corrected (manuallyAdjusted). So: create any
    // missing rows, then update only the auto (non-adjusted) ones, GROUPED BY
    // status so N students become ≤4 updateMany calls instead of N.
    const masterOps: Prisma.PrismaPromise<unknown>[] = [];
    if (period === 1) {
      masterOps.push(
        db.masterAttendance.createMany({
          data: entries.map((e) => ({
            studentId: e.studentId,
            classId,
            semesterId,
            date,
            status: e.status as never,
            markedById,
          })),
          skipDuplicates: true,
        }),
      );
      // Reuse the same status groups: one updateMany per status (skipping any row
      // the class teacher manually corrected).
      for (const [status, studentIds] of byStatus) {
        masterOps.push(
          db.masterAttendance.updateMany({
            where: { studentId: { in: studentIds }, date, manuallyAdjusted: false },
            data: { status: status as never, markedById },
          }),
        );
      }
    }
    await db.$transaction([...periodOps, ...masterOps]);

    return Response.json({ saved: entries.length, setDayAttendance: period === 1 }, { status: 200 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
