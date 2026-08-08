// GET /api/dashboard/analytics?date=YYYY-MM-DD — the analytics behind the staff
// Dashboard: headline KPIs, the daily attendance trend, status composition and
// per-class standing for the ACTIVE semester.
//
// ADDITIVE BY DESIGN. /api/me/staff-overview is untouched and still owns "who am
// I, what am I teaching today". This route owns the numbers, so a failure here
// degrades the dashboard to the overview it already had rather than breaking it.
//
// Everything below is COMPUTED FROM ROWS. There is no seeded, sampled or
// placeholder figure anywhere in the response: if a number can't be derived it is
// returned as null and the UI renders an em dash. A trend is only reported when
// there are two comparable windows of real records behind it — a delta with no
// history is decoration that reads as data.
//
// Scope follows the same axis as the rest of the app: an institution role sees
// everything, everyone else sees the department that OWNS the class (so a branch
// HOD's first-years, which S&H owns, are excluded here exactly as they are in the
// class lists).
import { authenticate, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDateOnly, resolveWeekday, roman, type Status } from "@/app/api/attendance/dto";

export const dynamic = "force-dynamic";

/** The eligibility line every Indian college enforces. Mirrors the student portal. */
const THRESHOLD = 75;
/** Recorded days plotted on the trend, and the size of each delta window. */
const TREND_DAYS = 30;
const WINDOW = 7;

const isAttended = (s: Status) => s === "PRESENT" || s === "OD";
const pct = (attended: number, total: number) =>
  total > 0 ? Math.round((attended / total) * 100) : null;

/** `date` as stored by @db.Date — a UTC midnight — back to "YYYY-MM-DD". */
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

// Attendance bands for the distribution. Fixed, not quantiles: the reader is
// checking a compliance rule, so the buckets have to mean the same thing every
// time the page loads (quantile buckets would move as the cohort moves).
// Labels are kept SHORT because they are axis ticks: five categories share the
// width of a third of the dashboard, and "Below 50%" ran into its neighbour on a
// phone.
const BANDS = [
  { key: "critical", label: "<50%", min: 0, max: 49 },
  { key: "short", label: "50–64%", min: 50, max: 64 },
  { key: "watch", label: "65–74%", min: 65, max: 74 },
  { key: "safe", label: "75–89%", min: 75, max: 89 },
  { key: "strong", label: "90%+", min: 90, max: 100 },
] as const;

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);

    // The caller's local "today" — same contract as /api/me/staff-overview, so
    // the two agree about which day the dashboard is showing.
    const dateStr = new URL(req.url).searchParams.get("date")?.trim() || "";
    const today = parseDateOnly(dateStr);

    const [semester, years] = await Promise.all([
      db.semester.findFirst({
        where: { isActive: true },
        include: { academicYear: { select: { id: true, name: true, startDate: true } } },
      }),
      // A handful of rows — cheaper to order them here than to run a second
      // query for "the year before the active one".
      db.academicYear.findMany({
        select: { id: true, name: true, startDate: true, isActive: true },
        orderBy: { startDate: "desc" },
      }),
    ]);

    const semesterLabel = semester
      ? `${semester.academicYear.name} · ${semester.kind === "ODD" ? "Odd" : "Even"}`
      : null;

    const activeYear = years.find((y) => y.isActive) ?? null;
    const activeIdx = activeYear ? years.findIndex((y) => y.id === activeYear.id) : -1;
    // `years` is newest-first, so the NEXT entry is the preceding year.
    const priorYear = activeIdx >= 0 ? (years[activeIdx + 1] ?? null) : null;

    const isAdmin = ctx.ability.can("manage", "Student");
    const unscoped = ctx.isInstitutionScoped;
    const dept = ctx.departmentId ?? "__none__";
    // Owning department, matching /api/attendance/report and the class lists.
    const classScope = unscoped ? {} : { departmentId: dept };
    const scopeLabel = unscoped ? "Institution-wide" : "Your department";

    // Which weekday's grid today runs (a working Saturday borrows a weekday's).
    // Anything else — Sunday, an undeclared Saturday — has no scheduled hours,
    // so marking progress is genuinely not applicable rather than zero.
    let weekday: Awaited<ReturnType<typeof resolveWeekday>> | null = null;
    if (today) weekday = await resolveWeekday(today);
    const todayWeekday = weekday && "weekday" in weekday ? weekday.weekday : null;

    if (!semester) {
      return Response.json({
        semesterLabel: null,
        scopeLabel,
        noActiveSemester: true,
        admin: null,
        teaching: null,
      });
    }

    const semesterId = semester.id;
    // MasterAttendance is the OFFICIAL day record — it is what the overall
    // percentage and the eligibility rule are computed from. PeriodAttendance is
    // only used below for "was this hour marked", which is a different question.
    const attWhere = { semesterId, ...(unscoped ? {} : { class: { departmentId: dept } }) };

    // These reads are independent of one another, so they go out together. Each
    // sequential await would cost its own ~90ms round-trip to Neon; grouped, the
    // whole block costs about one.
    const [
      studentsNow,
      studentsPrior,
      facultyCount,
      classRows,
      byDate,
      byStudent,
      byClass,
      pendingRows,
      scheduledToday,
      markedTodayRows,
      myMarkedToday,
      mySlotsToday,
    ] = await Promise.all([
      // Students ON ROLL this year, counted through the class they sit in —
      // the same derivation /api/students and the overview snapshot use.
      activeYear
        ? db.enrollment.count({ where: { academicYearId: activeYear.id, class: classScope } })
        : Promise.resolve(0),
      // Same definition one year earlier, which is what makes the delta honest.
      priorYear
        ? db.enrollment.count({ where: { academicYearId: priorYear.id, class: classScope } })
        : Promise.resolve(null),
      // Faculty on the employment axis (a lecturer's department employs them,
      // which is a different question from which programs they teach in).
      isAdmin
        ? db.facultyProfile.count({ where: unscoped ? {} : { departmentId: dept } })
        : Promise.resolve(0),
      // Classes + their roster sizes. One query serving three panels: the class
      // count, the year mix, and the denominator for per-class attendance.
      isAdmin
        ? db.class.findMany({
            where: { ...classScope, isActive: true },
            select: {
              id: true,
              year: true,
              section: true,
              program: { select: { branch: { select: { code: true } } } },
              _count: {
                select: { enrollments: { where: { academicYear: { isActive: true } } } },
              },
            },
            orderBy: [{ year: "asc" }, { section: "asc" }],
          })
        : Promise.resolve([]),
      // The trend: one row per (day, status). ~4 rows a day, so a full semester
      // is a few hundred rows — aggregated in Postgres, not shipped raw.
      isAdmin
        ? db.masterAttendance.groupBy({
            by: ["date", "status"],
            where: attWhere,
            _count: { _all: true },
            orderBy: { date: "asc" },
          })
        : Promise.resolve([]),
      // Per-student totals — the at-risk count and the band distribution.
      isAdmin
        ? db.masterAttendance.groupBy({
            by: ["studentId", "status"],
            where: attWhere,
            _count: { _all: true },
          })
        : Promise.resolve([]),
      // Per-class totals — the standings panel.
      isAdmin
        ? db.masterAttendance.groupBy({
            by: ["classId", "status"],
            where: attWhere,
            _count: { _all: true },
          })
        : Promise.resolve([]),
      // Leave/OD waiting on a human. Both stages, counted separately: they are
      // different people's queues.
      isAdmin
        ? db.leaveRequest.groupBy({
            by: ["status"],
            where: {
              semesterId,
              status: { in: ["PENDING_TEACHER", "PENDING_HOD"] },
              ...(unscoped ? {} : { class: { departmentId: dept } }),
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      // Scheduled hours today. TimetableSlot is unique on
      // (classId, semesterId, dayOfWeek, period), so this counts distinct hours.
      isAdmin && todayWeekday
        ? db.timetableSlot.count({
            where: { semesterId, dayOfWeek: todayWeekday, class: classScope },
          })
        : Promise.resolve(0),
      // …and the ones that actually have a register. Grouping by (class, period)
      // collapses the per-student rows back to one row per marked hour.
      isAdmin && today && todayWeekday
        ? db.periodAttendance.groupBy({
            by: ["classId", "period"],
            where: { semesterId, date: today, ...(unscoped ? {} : { class: { departmentId: dept } }) },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      // For a teaching member of staff: which of THEIR hours today already have a
      // register. Returned as pairs so the dashboard can flag the unmarked ones
      // without /api/me/staff-overview having to change shape.
      //
      // Scoped to the classes they teach today rather than to `markedById`: an
      // hour covered by a substitute is signed by the substitute, and the teacher
      // should see it as done, not as a gap. The exact (class, period) pairs are
      // intersected below — this `some` only narrows the query, it does not
      // decide the answer.
      today && todayWeekday
        ? db.periodAttendance.groupBy({
            by: ["classId", "period"],
            where: {
              semesterId,
              date: today,
              class: {
                timetableSlots: {
                  some: { semesterId, dayOfWeek: todayWeekday, facultyId: ctx.user.id },
                },
              },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      // The caller's own hours today, so the pairs above can be filtered down to
      // the ones that are actually theirs (a colleague teaching period 3 to the
      // same class must not tick off their period 5).
      todayWeekday
        ? db.timetableSlot.findMany({
            where: { semesterId, dayOfWeek: todayWeekday, facultyId: ctx.user.id },
            select: { classId: true, period: true },
          })
        : Promise.resolve([]),
    ]);

    const mine = new Set(mySlotsToday.map((s) => `${s.classId}:${s.period}`));
    const teaching = {
      markedToday: myMarkedToday
        .filter((r) => mine.has(`${r.classId}:${r.period}`))
        .map((r) => ({ classId: r.classId, period: r.period })),
    };

    if (!isAdmin) {
      return Response.json({ semesterLabel, scopeLabel, noActiveSemester: false, admin: null, teaching });
    }

    // ---- Trend: fold (day, status) rows into one point per day. ------------
    const perDay = new Map<string, { attended: number; total: number }>();
    for (const row of byDate) {
      const key = dateKey(row.date);
      const cell = perDay.get(key) ?? { attended: 0, total: 0 };
      cell.total += row._count._all;
      if (isAttended(row.status as Status)) cell.attended += row._count._all;
      perDay.set(key, cell);
    }
    // Recorded days only. A holiday has no rows, and plotting it as 0% would
    // invent an attendance collapse that never happened.
    const allDays = [...perDay.entries()]
      .map(([date, c]) => ({ date, attended: c.attended, total: c.total, pct: pct(c.attended, c.total) ?? 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const trend = allDays.slice(-TREND_DAYS);

    // Two adjacent windows of recorded days. Reported only when BOTH are full —
    // a 7-day figure compared against a 2-day one is not a trend.
    const sum = (rows: typeof allDays) =>
      rows.reduce((a, r) => ({ attended: a.attended + r.attended, total: a.total + r.total }), {
        attended: 0,
        total: 0,
      });
    const recentRows = allDays.slice(-WINDOW);
    const priorRows = allDays.slice(-WINDOW * 2, -WINDOW);
    const recent = sum(recentRows);
    const prior = sum(priorRows);
    const recentPct = recentRows.length === WINDOW ? pct(recent.attended, recent.total) : null;
    const priorPct = priorRows.length === WINDOW ? pct(prior.attended, prior.total) : null;

    // ---- Composition + overall: summed from the same rows, so the donut and
    // the headline percentage can never disagree. -------------------------
    const composition = { present: 0, absent: 0, od: 0, excused: 0 };
    for (const row of byDate) {
      const s = row.status as Status;
      if (s === "PRESENT") composition.present += row._count._all;
      else if (s === "ABSENT") composition.absent += row._count._all;
      else if (s === "OD") composition.od += row._count._all;
      else composition.excused += row._count._all;
    }
    const compTotal = composition.present + composition.absent + composition.od + composition.excused;
    const compAttended = composition.present + composition.od;

    // ---- Per-student → at-risk count + band distribution. ------------------
    const perStudent = new Map<string, { attended: number; total: number }>();
    for (const row of byStudent) {
      const cell = perStudent.get(row.studentId) ?? { attended: 0, total: 0 };
      cell.total += row._count._all;
      if (isAttended(row.status as Status)) cell.attended += row._count._all;
      perStudent.set(row.studentId, cell);
    }
    const bandCounts = new Map<string, number>(BANDS.map((b) => [b.key, 0]));
    let atRisk = 0;
    let withRecords = 0;
    for (const cell of perStudent.values()) {
      const p = pct(cell.attended, cell.total);
      // A student with no day records yet is not "at 0%" — they are unmeasured,
      // and counting them as at-risk would put the whole cohort in the red on
      // the first day of a semester.
      if (p === null) continue;
      withRecords++;
      if (p < THRESHOLD) atRisk++;
      const band = BANDS.find((b) => p >= b.min && p <= b.max);
      if (band) bandCounts.set(band.key, (bandCounts.get(band.key) ?? 0) + 1);
    }

    // ---- Per-class standings. ---------------------------------------------
    const perClass = new Map<string, { attended: number; total: number }>();
    for (const row of byClass) {
      const cell = perClass.get(row.classId) ?? { attended: 0, total: 0 };
      cell.total += row._count._all;
      if (isAttended(row.status as Status)) cell.attended += row._count._all;
      perClass.set(row.classId, cell);
    }
    const classes = classRows.map((c) => {
      const cell = perClass.get(c.id) ?? { attended: 0, total: 0 };
      return {
        classId: c.id,
        label: `${c.program.branch.code} ${roman(c.year)}-${c.section}`,
        year: c.year,
        students: c._count.enrollments,
        attended: cell.attended,
        total: cell.total,
        pct: pct(cell.attended, cell.total),
      };
    });

    // Year mix, folded from the same class rows.
    const yearMix = [...classes.reduce((m, c) => m.set(c.year, (m.get(c.year) ?? 0) + c.students), new Map<number, number>())]
      .map(([year, students]) => ({ year, label: roman(year), students }))
      .sort((a, b) => a.year - b.year);

    const pending = { teacher: 0, hod: 0 };
    for (const row of pendingRows) {
      if (row.status === "PENDING_TEACHER") pending.teacher = row._count._all;
      else if (row.status === "PENDING_HOD") pending.hod = row._count._all;
    }

    return Response.json({
      semesterLabel,
      scopeLabel,
      noActiveSemester: false,
      teaching,
      admin: {
        threshold: THRESHOLD,
        window: WINDOW,
        unscoped,
        headline: {
          students: studentsNow,
          studentsPrior,
          priorYearName: priorYear?.name ?? null,
          faculty: facultyCount,
          classes: classRows.length,
          attendancePct: pct(compAttended, compTotal),
          attendanceDays: compTotal,
          recentPct,
          priorPct,
          atRisk,
          atRiskOf: withRecords,
          pendingTeacher: pending.teacher,
          pendingHod: pending.hod,
          scheduledToday,
          markedToday: markedTodayRows.length,
          // Sunday / an undeclared Saturday has no grid, so "0 of 0 marked" would
          // read as a failure to mark rather than as a day off.
          isWorkingDay: todayWeekday !== null,
        },
        composition: { ...composition, total: compTotal, attended: compAttended },
        trend,
        classes,
        yearMix,
        bands: BANDS.map((b) => ({ key: b.key, label: b.label, students: bandCounts.get(b.key) ?? 0 })),
      },
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
