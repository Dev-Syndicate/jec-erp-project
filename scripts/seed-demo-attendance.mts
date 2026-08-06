// Seed DEMO attendance + leave for the TEST database, so the dashboard can be
// seen with data in it. Writes only time-bound records — it never touches
// students, staff, classes, subjects or the timetable.
//
//   pnpm exec tsx --env-file=.env scripts/seed-demo-attendance.mts
//   pnpm exec tsx --env-file=.env scripts/seed-demo-attendance.mts --undo
//
// REVERSIBLE. `--undo` deletes exactly what this writes: every MasterAttendance
// and PeriodAttendance row in the semester's working-day range it filled, plus
// the leave requests it created. That is why it only ever creates PENDING and
// REJECTED leave — an APPROVED request is supposed to have written OD/EXCUSED
// attendance across its range, and faking the approval without that side effect
// would leave the two disagreeing.
//
// Deterministic: a fixed seed drives every roll, so a re-run reproduces the same
// figures rather than drifting, and `createMany({ skipDuplicates })` makes a
// re-run a no-op instead of a unique-constraint failure.
//
// ⚠️ Guarded by assertTestEnv() — it refuses to run against production, and
// cross-checks the Neon host rather than trusting the ERP_ENV label.
import { assertTestEnv } from "./guard-env.js";

assertTestEnv("seed-demo-attendance.mts");

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "../src/generated/prisma/client.js";

neonConfig.webSocketConstructor = ws;

const db = new PrismaClient({
  adapter: new PrismaNeon({
    connectionString: (process.env.DATABASE_URL ?? "").replace(
      /([?&])channel_binding=require&?/,
      "$1",
    ),
  }),
});

const UNDO = process.argv.includes("--undo");

type Status = "PRESENT" | "ABSENT" | "OD" | "EXCUSED";
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

/** Seeded PRNG — reproducible runs beat a different dashboard every time. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260806);

const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const semester = await db.semester.findFirst({
    where: { isActive: true },
    include: { academicYear: { select: { name: true, isActive: true } } },
  });
  if (!semester) throw new Error("No active semester — activate one first.");

  // The window: every Mon–Fri from the semester start up to and including today,
  // capped at the semester end. Saturdays are skipped because a working Saturday
  // is an admin declaration (the WorkingDay table), and inventing one here would
  // put attendance on a day the app itself calls a holiday.
  const today = utcDay(new Date());
  const start = utcDay(semester.startDate);
  const end = today < utcDay(semester.endDate) ? today : utcDay(semester.endDate);

  const workdays: Date[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = DAYS[d.getUTCDay()];
    if (dow !== "SAT" && dow !== "SUN") workdays.push(new Date(d));
  }
  if (workdays.length === 0) throw new Error("No working days in range.");

  console.log(`semester : ${semester.academicYear.name} ${semester.kind}`);
  console.log(`window   : ${iso(workdays[0])} → ${iso(workdays[workdays.length - 1])} (${workdays.length} working days)\n`);

  if (UNDO) {
    const range = { gte: workdays[0], lte: workdays[workdays.length - 1] };
    const p = await db.periodAttendance.deleteMany({ where: { semesterId: semester.id, date: range } });
    const m = await db.masterAttendance.deleteMany({ where: { semesterId: semester.id, date: range } });
    const l = await db.leaveRequest.deleteMany({
      where: { semesterId: semester.id, reason: { startsWith: "[demo]" } },
    });
    console.log(`removed  : ${m.count} master · ${p.count} period · ${l.count} leave`);
    return;
  }

  const classes = await db.class.findMany({
    where: { isActive: true },
    select: {
      id: true,
      year: true,
      section: true,
      advisorId: true,
      program: { select: { branch: { select: { code: true } } } },
      // Ordered so the seeded PRNG walks students in a stable sequence and a
      // re-run reproduces the same figures.
      enrollments: {
        where: { academicYear: { isActive: true } },
        select: { studentId: true },
        orderBy: { studentId: "asc" },
      },
      timetableSlots: {
        where: { semesterId: semester.id },
        select: { dayOfWeek: true, period: true, subjectId: true, facultyId: true },
      },
    },
    orderBy: [{ year: "asc" }, { section: "asc" }],
  });
  const withStudents = classes.filter((c) => c.enrollments.length > 0 && c.timetableSlots.length > 0);
  if (withStudents.length === 0) throw new Error("No class has both a roster and a timetable.");

  const fallbackMarker =
    withStudents[0].advisorId ?? withStudents[0].timetableSlots[0].facultyId;

  // A spread of class-level rates, so "Classes needing attention" actually ranks
  // and the band chart fills all five buckets. Two classes sit below the 75%
  // line on purpose — a dashboard where nothing needs attention proves nothing.
  const CLASS_RATES = [63, 71, 74, 79, 84, 88, 91, 95];

  const master: Array<{
    studentId: string; classId: string; semesterId: string; date: Date;
    status: Status; markedById: string;
  }> = [];
  const period: Array<{
    studentId: string; subjectId: string; classId: string; semesterId: string;
    date: Date; period: number; status: Status; markedById: string;
  }> = [];

  const todayIso = iso(today);

  for (const [ci, klass] of withStudents.entries()) {
    const base = CLASS_RATES[ci % CLASS_RATES.length];
    const marker = klass.advisorId ?? fallbackMarker;

    // Per-student rate around the class base, so a class average of 84% is made
    // of students at 60 and students at 97 rather than everyone at 84.
    const studentRate = new Map<string, number>();
    for (const e of klass.enrollments) {
      const spread = (rand() + rand() + rand() - 1.5) * 16; // ~normal, ±24
      studentRate.set(e.studentId, Math.min(99, Math.max(38, base + spread)));
    }

    // Today is deliberately only PARTLY marked, so the "Today's marking" meter
    // shows a real fraction. Classes past the cutoff have no register today.
    const marksToday = ci % 4 !== 3;
    const todayCutoff = 3 + Math.floor(rand() * 4); // periods 1..cutoff marked

    for (const [di, day] of workdays.entries()) {
      const dow = DAYS[day.getUTCDay()] as "MON" | "TUE" | "WED" | "THU" | "FRI";
      const slots = klass.timetableSlots
        .filter((s) => s.dayOfWeek === dow)
        .sort((a, b) => a.period - b.period);
      if (slots.length === 0) continue;

      const isToday = iso(day) === todayIso;
      if (isToday && !marksToday) continue;

      // A whole-day wobble, so the trend line has shape instead of noise…
      const wobble = (rand() - 0.5) * 9;
      // …plus a slow decline across the term. Without it the series is
      // stationary, every 7-day window lands on the same figure, and the
      // dashboard's week-on-week delta renders a permanent "0 pts" — which
      // reads as a broken indicator rather than as a steady cohort. Attendance
      // really does sag as a semester wears on, so the drift is also truer.
      const drift = 4 - (8 * di) / Math.max(1, workdays.length - 1);
      const dayShift = wobble + drift;

      for (const e of klass.enrollments) {
        const p = Math.min(99, Math.max(15, (studentRate.get(e.studentId) ?? base) + dayShift)) / 100;

        let dayStatus: Status | null = null;
        for (const slot of slots) {
          if (isToday && slot.period > todayCutoff) continue;

          const r = rand();
          let status: Status;
          if (r < p) {
            // OD is on-duty college work — it counts as attended, so it comes out
            // of the attended mass rather than being added on top.
            status = r < p * 0.05 ? "OD" : "PRESENT";
          } else {
            status = rand() < 0.18 ? "EXCUSED" : "ABSENT";
          }
          period.push({
            studentId: e.studentId, subjectId: slot.subjectId, classId: klass.id,
            semesterId: semester.id, date: day, period: slot.period,
            status, markedById: slot.facultyId,
          });
          // The domain rule: marking period 1 sets that student's official DAY
          // record to the same status. Generating the two independently would
          // leave the day record contradicting the first hour of the day.
          //
          // `slots[0]` is the day's FIRST timetabled hour, which is period 1
          // whenever period 1 is timetabled. Anchoring on the first hour rather
          // than literally `period === 1` matters: a class whose Tuesday starts
          // at period 2 would otherwise get no day record at all that Tuesday,
          // punching a hole in the trend.
          if (slot.period === slots[0].period) dayStatus = status;
        }

        if (dayStatus !== null) {
          master.push({
            studentId: e.studentId, classId: klass.id, semesterId: semester.id,
            date: day, status: dayStatus, markedById: marker,
          });
        }
      }
    }
  }

  console.log(`building : ${master.length.toLocaleString()} master · ${period.length.toLocaleString()} period rows`);

  const CHUNK = 5000;
  let done = 0;
  for (let i = 0; i < master.length; i += CHUNK) {
    const r = await db.masterAttendance.createMany({ data: master.slice(i, i + CHUNK), skipDuplicates: true });
    done += r.count;
    process.stdout.write(`\rmaster   : ${done.toLocaleString()} / ${master.length.toLocaleString()}`);
  }
  console.log();
  done = 0;
  for (let i = 0; i < period.length; i += CHUNK) {
    const r = await db.periodAttendance.createMany({ data: period.slice(i, i + CHUNK), skipDuplicates: true });
    done += r.count;
    process.stdout.write(`\rperiod   : ${done.toLocaleString()} / ${period.length.toLocaleString()}`);
  }
  console.log();

  // Leave / OD awaiting a human, so "Pending approvals" has something in it.
  // PENDING and REJECTED only — see the note at the top of the file.
  const pool = withStudents.flatMap((c) =>
    c.enrollments.slice(0, 3).map((e) => ({ studentId: e.studentId, classId: c.id })),
  );
  const REASONS = [
    "Inter-college symposium — presenting a paper",
    "Sick leave, medical certificate attached",
    "Sports meet — university selection round",
    "NSS camp duty",
    "Family function out of station",
    "Hospital review appointment",
  ];
  const leave = pool.slice(0, 11).map((s, i) => {
    const from = new Date(workdays[Math.max(0, workdays.length - 1 - (i % 9))]);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + (i % 3));
    return {
      studentId: s.studentId, classId: s.classId, semesterId: semester.id,
      type: (i % 3 === 0 ? "OD" : "LEAVE") as "OD" | "LEAVE",
      fromDate: from, toDate: to,
      // The "[demo]" prefix is what --undo matches on.
      reason: `[demo] ${REASONS[i % REASONS.length]}`,
      status: (i < 5 ? "PENDING_TEACHER" : i < 9 ? "PENDING_HOD" : "REJECTED") as
        | "PENDING_TEACHER" | "PENDING_HOD" | "REJECTED",
      ...(i >= 9 ? { rejectionReason: "Insufficient supporting document." } : {}),
    };
  });
  const lr = await db.leaveRequest.createMany({ data: leave, skipDuplicates: true });
  console.log(`leave    : ${lr.count} requests (5 with the class teacher, 4 with the HOD, 2 rejected)`);
}

try {
  await main();
} finally {
  await db.$disconnect();
}
