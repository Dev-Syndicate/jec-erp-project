// Student portal — the signed-in student's own overview, built around the
// questions a student opens this to answer, in priority order:
//   1. Am I safe on attendance? (the 75% line decides exam eligibility)
//   2. What's on today / what's my next class?
//   3. Anything I need to do (apply for OD/leave)?
// The full week and internal marks are their own nav pages (/my-timetable,
// /my-marks) — both are look-ups rather than things to scan daily, and each was
// costing the dashboard a section that read "nothing here yet" most of the term.
// All data is self-scoped server-side (GET /api/me/overview) — no client id.
"use client";

import Link from "next/link";
import { CalendarPlus, ChevronRight } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";

import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { FormError } from "@/components/form-error";
import { PageShell } from "@/app/(app)/page-shell";
import { useStudentOverview } from "@/features/student-portal/hooks/use-portal";
import type {
  OverallAttendance,
  PortalSlot,
  StudentOverview,
  SubjectAttendance,
  TodaySchedule,
  Weekday,
} from "@/features/student-portal/types";

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
};
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

// The eligibility line every Indian college enforces.
const THRESHOLD = 75;

function pctTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= THRESHOLD) return "text-emerald-600";
  if (pct >= 65) return "text-amber-600";
  return "text-destructive";
}
function barTone(pct: number | null): string {
  if (pct === null) return "bg-muted-foreground/30";
  if (pct >= THRESHOLD) return "bg-emerald-500";
  if (pct >= 65) return "bg-amber-500";
  return "bg-destructive";
}

export function StudentDashboard() {
  const { data, isPending, isError, error } = useStudentOverview();

  if (isPending) {
    // A skeleton rather than a spinner here, because this screen's shape is
    // known and stable — hero, then today's strip. Matching the real layout
    // means the content lands in place instead of pushing the page around.
    return (
      <PageShell width="narrow">
        <div className="h-40 animate-pulse rounded-2xl bg-muted/60" />
        <div className="h-28 animate-pulse rounded-2xl bg-muted/40" />
      </PageShell>
    );
  }
  if (isError) {
    return (
      <PageShell width="narrow">
        <FormError>
          {error instanceof Error ? error.message : "Couldn't load your dashboard."}
        </FormError>
      </PageShell>
    );
  }

  const o = data as StudentOverview;
  const firstName = o.profile.displayName.split(" ")[0];

  return (
    <PageShell width="narrow" className="gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow text-primary">
            {o.profile.registerNumber}
            {o.profile.classLabel ? ` · ${o.profile.programLabel} · ${o.profile.classLabel}` : ""}
            {o.semesterLabel ? ` · ${o.semesterLabel}` : ""}
          </span>
          <h1 className="font-heading text-2xl font-semibold text-foreground md:text-3xl">
            Hello, {firstName}
          </h1>
        </div>
        <Link
          href="/leave"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <CalendarPlus className="size-4" />
          Apply for OD / Leave
        </Link>
      </header>

      {o.notEnrolled ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            You&apos;re not enrolled in a class for the active year yet. Your attendance, timetable and
            marks will show here once you&apos;re placed.
          </p>
        </div>
      ) : (
        <>
          {/* Hero row: the attendance verdict + today's classes, side by side. */}
          <div className="grid gap-4 lg:grid-cols-5">
            <AttendanceHero overall={o.attendance.overall} className="lg:col-span-2" />
            <TodayStrip slots={o.timetable} today={o.today} className="lg:col-span-3" />
          </div>

          <SubjectAttendanceList subjects={o.attendance.subjects} />
        </>
      )}
    </PageShell>
  );
}

// The hero: overall attendance as a status, not just a number. The 75% line is
// drawn on the meter so the student sees how much headroom (or deficit) they have.
function AttendanceHero({
  overall,
  className = "",
}: {
  overall: StudentOverview["attendance"]["overall"];
  className?: string;
}) {
  const pct = overall?.pct ?? null;
  const hasData = overall !== null && overall.total > 0 && pct !== null;

  const verdict = !hasData
    ? { label: "No attendance yet", sub: "Nothing recorded for this semester." }
    : pct! >= THRESHOLD
      ? { label: "You're safe", sub: `${pct! - THRESHOLD}% above the ${THRESHOLD}% line.` }
      : pct! >= 65
        ? { label: "Watch out", sub: `${THRESHOLD - pct!}% below the ${THRESHOLD}% line.` }
        : { label: "Attendance short", sub: `${THRESHOLD - pct!}% below the ${THRESHOLD}% line.` };

  return (
    <section
      // min-w-0 for the same reason as TodayStrip beside it: a grid item that
      // will not shrink drags the page into a horizontal scroll on a phone.
      className={`flex min-w-0 flex-col justify-between gap-5 rounded-2xl border border-border bg-card p-4 sm:p-6 ${className}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Overall attendance
        </span>
        <span className={`text-sm font-medium ${pctTone(pct)}`}>{verdict.label}</span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-end gap-3">
          <span className={`font-heading text-6xl font-semibold leading-none ${pctTone(pct)}`}>
            {hasData ? pct : "—"}
            {hasData && <span className="text-3xl">%</span>}
          </span>
          {hasData && (
            <span className="pb-1 text-xs text-muted-foreground">
              {overall!.attended} / {overall!.total} days
            </span>
          )}
        </div>

        {/* The percentage says how much; the donut says what of. A student on
            72% wants to know whether the gap is absences or approved OD, and
            those are different conversations with their class teacher. */}
        {hasData && <AttendanceDonut overall={overall!} />}
      </div>

      {/* Meter with the 75% threshold notch. */}
      <div>
        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-[width] ${barTone(pct)}`}
            style={{ width: `${pct ?? 0}%` }}
          />
          <div
            className="absolute inset-y-0 w-px bg-foreground/40"
            style={{ left: `${THRESHOLD}%` }}
            aria-hidden
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{verdict.sub}</p>
      </div>
    </section>
  );
}

// The four statuses as a ring. Colours are the FIXED --status-* tokens, not the
// brand ramp: present/absent/OD/excused encode meaning, so they stay green, red,
// amber and violet whatever --brand-hue becomes.
//
// Zero-count slices are filtered out — Recharts would otherwise emit an
// invisible path that the tooltip can still land on, giving "OD: 0" on hover
// over nothing.
const DONUT_SLICES = [
  { key: "present", label: "Present", color: "var(--status-present)" },
  { key: "absent", label: "Absent", color: "var(--status-absent)" },
  { key: "od", label: "On duty", color: "var(--status-od)" },
  { key: "excused", label: "Excused", color: "var(--status-excused)" },
] as const;

function AttendanceDonut({ overall }: { overall: NonNullable<OverallAttendance> }) {
  const data = DONUT_SLICES.map((s) => ({
    name: s.label,
    value: overall[s.key],
    color: s.color,
  })).filter((d) => d.value > 0);

  if (data.length === 0) return null;

  return (
    <ChartContainer
      height={104}
      className="hidden w-28 shrink-0 sm:block"
      // The list below the hero carries the same numbers in text, so this is a
      // summary rather than the only route to the data.
      label={`Attendance breakdown: ${data.map((d) => `${d.name} ${d.value}`).join(", ")} days`}
    >
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="62%"
          outerRadius="100%"
          paddingAngle={2}
          stroke="none"
          isAnimationActive={false}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        {/* Params are left to be inferred from Recharts' Formatter type — it
            widens value to `ValueType | undefined`, so annotating them `number`
            narrows below what the library can actually pass. */}
        <ChartTooltip formatter={(v, n) => [`${v} days`, n]} />
      </PieChart>
    </ChartContainer>
  );
}

// Today's schedule as a compact timeline — the "what's next" a student scans for,
// pulled out of the full weekly grid so they don't have to read a table. The whole
// week lives on its own page (/my-timetable), linked from the header here.
function TodayStrip({
  slots,
  today,
  className = "",
}: {
  slots: PortalSlot[];
  today: TodaySchedule;
  className?: string;
}) {
  // The weekday comes from the server, not from the date: on a declared working
  // Saturday this is the weekday whose grid the college is running.
  const todayKey = today.weekday;
  const todays = todayKey
    ? PERIODS.map((p) => slots.find((s) => s.dayOfWeek === todayKey && s.period === p) ?? null)
    : [];
  const hasClasses = todays.some(Boolean);

  return (
    // `min-w-0` is load-bearing on phones. This section is a GRID ITEM, and a
    // grid item's default `min-width: auto` refuses to shrink below its content
    // — so the eight-period strip below (which is `overflow-x-auto` and meant to
    // scroll inside this card) instead forced the section to its full 954px
    // content width, dragging the whole page into a horizontal scroll at 390px.
    // With min-w-0 the section takes the column's width and the strip scrolls,
    // which is what the overflow-x-auto was always for.
    <section
      className={`flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-6 ${className}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Today
        </span>
        <div className="flex items-baseline gap-3">
          <span className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
          </span>
          <Link
            href="/my-timetable"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
          >
            Full week
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {today.followsDay && (
        // A working Saturday runs a weekday's grid — say which, or the strip
        // looks like the wrong day's classes.
        <p className="text-xs text-primary">
          Working Saturday — running {WEEKDAY_LABEL[today.followsDay]}&rsquo;s timetable.
        </p>
      )}

      {!todayKey ? (
        <p className="flex flex-1 items-center text-sm text-muted-foreground">
          No classes today — it&apos;s a holiday.
        </p>
      ) : !hasClasses ? (
        <p className="flex flex-1 items-center text-sm text-muted-foreground">
          No classes scheduled for today.
        </p>
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {todays.map((slot, i) => (
            <div
              key={i}
              className={`flex min-w-24 flex-col gap-0.5 rounded-lg px-3 py-2.5 ${
                slot ? "bg-primary/5 ring-1 ring-primary/15" : "bg-muted/40"
              }`}
            >
              <span className="font-mono text-[0.6rem] text-muted-foreground">P{i + 1}</span>
              {slot ? (
                <>
                  <span className="text-sm font-medium leading-tight">{slot.subjectCode}</span>
                  <span className="truncate text-[0.7rem] text-muted-foreground">
                    {slot.facultyName}
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground/40">Free</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-heading text-sm font-semibold text-foreground">{title}</h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function SubjectAttendanceList({ subjects }: { subjects: SubjectAttendance[] }) {
  if (subjects.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Attendance by subject" hint="Present / total periods" />
      <div className="grid gap-2 sm:grid-cols-2">
        {subjects.map((s) => (
          <div
            key={s.subjectId}
            className="flex items-center gap-3 rounded-xl border border-border px-4 py-3"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-mono text-xs">{s.code}</span>
              <span className="truncate text-xs text-muted-foreground">{s.name}</span>
            </div>
            <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block">
              <div className={`h-full ${barTone(s.pct)}`} style={{ width: `${s.pct ?? 0}%` }} />
            </div>
            <span className={`w-12 text-right font-mono text-sm ${pctTone(s.pct)}`}>
              {s.pct === null ? "—" : `${s.pct}%`}
            </span>
            <span className="w-12 text-right text-xs text-muted-foreground">
              {s.attended}/{s.total}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

