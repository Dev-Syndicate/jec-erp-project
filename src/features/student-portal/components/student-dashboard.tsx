// Student portal — the signed-in student's own overview, redesigned around the
// four questions a student actually opens this to answer, in priority order:
//   1. Am I safe on attendance? (the 75% line decides exam eligibility)
//   2. What's on today / what's my next class?
//   3. How are my internal marks?
//   4. Anything I need to do (apply for OD/leave)?
// All data is self-scoped server-side (GET /api/me/overview) — no client id.
"use client";

import Link from "next/link";
import { CalendarPlus, ChevronRight } from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { AXIS_PROPS, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { FormError } from "@/components/form-error";
import { PageShell } from "@/app/(app)/page-shell";
import { useStudentOverview } from "@/features/student-portal/hooks/use-portal";
import type {
  OverallAttendance,
  PortalSlot,
  StudentOverview,
  SubjectAttendance,
  SubjectMarks,
  Weekday,
} from "@/features/student-portal/types";

const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];
const WEEKDAY_LABEL: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
};
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
// Sun=0..Sat=6 → our weekday key (null on the weekend).
const TODAY_KEY: (Weekday | null)[] = [null, "MON", "TUE", "WED", "THU", "FRI", null];

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

/**
 * The same three bands as barTone, as a CSS colour rather than a class — SVG
 * fills cannot take a Tailwind class, and Recharts needs a value it can put on
 * a `fill` attribute.
 *
 * ⚠️ The 75 / 65 boundaries here MUST track pctTone and barTone above. They are
 * a college eligibility rule, not a palette choice: a student reading 74% must
 * see the same "short" signal in the number, the meter and the chart. Deliberately
 * NOT unified with attendance-report.tsx's pctTone, which bands against a
 * user-CHOSEN threshold — merging them would silently change which students look
 * at risk on a compliance screen.
 */
function toneVar(pct: number | null): string {
  if (pct === null) return "var(--muted-foreground)";
  if (pct >= THRESHOLD) return "var(--status-present)";
  if (pct >= 65) return "var(--status-od)";
  return "var(--status-absent)";
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
            <TodayStrip slots={o.timetable} className="lg:col-span-3" />
          </div>

          <SubjectAttendanceList subjects={o.attendance.subjects} />
          <Marks marks={o.marks} />
          <WeeklyTimetable slots={o.timetable} />
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
      className={`flex flex-col justify-between gap-5 rounded-2xl border border-border bg-card p-6 ${className}`}
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
// pulled out of the full weekly grid so they don't have to read a table.
function TodayStrip({ slots, className = "" }: { slots: PortalSlot[]; className?: string }) {
  const todayKey = TODAY_KEY[new Date().getDay()];
  const todays = todayKey
    ? PERIODS.map((p) => slots.find((s) => s.dayOfWeek === todayKey && s.period === p) ?? null)
    : [];
  const hasClasses = todays.some(Boolean);

  return (
    <section className={`flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 ${className}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Today
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
        </span>
      </div>

      {!todayKey ? (
        <p className="flex flex-1 items-center text-sm text-muted-foreground">
          It&apos;s the weekend — no scheduled classes.
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

// Subject attendance against the eligibility line. This is the chart that earns
// its place on the page: the list below gives exact figures, but "which of my
// subjects is below 75%" is a comparison, and a row of bars against a single
// dashed rule answers it in one glance where eight percentages do not.
function SubjectAttendanceChart({ subjects }: { subjects: SubjectAttendance[] }) {
  const data = subjects
    .filter((s) => s.pct !== null)
    .map((s) => ({ code: s.code, pct: s.pct as number, name: s.name }));

  // One or two subjects is a list, not a comparison — the chart would be noise.
  if (data.length < 3) return null;

  return (
    <ChartContainer
      height={Math.max(140, data.length * 28)}
      label={`Attendance percentage by subject, against the ${THRESHOLD}% eligibility line`}
      className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <XAxis type="number" domain={[0, 100]} unit="%" {...AXIS_PROPS} />
        <YAxis
          type="category"
          dataKey="code"
          width={64}
          {...AXIS_PROPS}
          tick={{ ...AXIS_PROPS.tick, fontFamily: "var(--font-mono)" }}
        />
        <ReferenceLine
          x={THRESHOLD}
          stroke="var(--foreground)"
          strokeOpacity={0.45}
          strokeDasharray="4 4"
          label={{
            value: `${THRESHOLD}%`,
            position: "top",
            fill: "var(--muted-foreground)",
            fontSize: 10,
          }}
        />
        <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false}>
          {data.map((d) => (
            // Per-bar colour, so a subject below the line reads as short at a
            // glance rather than needing the axis to be read.
            <Cell key={d.code} fill={toneVar(d.pct)} />
          ))}
        </Bar>
        <ChartTooltip
          formatter={(v) => [`${v}%`, "Attendance"]}
          // The axis shows the subject CODE (it has to fit in 64px); the tooltip
          // is where there is room for the full name.
          labelFormatter={(code) => data.find((d) => d.code === code)?.name ?? String(code)}
        />
      </BarChart>
    </ChartContainer>
  );
}

function SubjectAttendanceList({ subjects }: { subjects: SubjectAttendance[] }) {
  if (subjects.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Attendance by subject" hint="Present / total periods" />
      <SubjectAttendanceChart subjects={subjects} />
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

function Marks({ marks }: { marks: SubjectMarks[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Internal marks" />
      {marks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          No marks published yet.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {marks.map((m) => (
            <div
              key={m.subjectId}
              className="flex flex-col gap-2.5 rounded-xl border border-border px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="font-mono text-xs">{m.code}</span>
                <span className="truncate text-xs text-muted-foreground">{m.name}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.items.map((it) => (
                  <span
                    key={it.assessment}
                    className="inline-flex items-baseline gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs"
                  >
                    <span className="font-mono text-[0.65rem] text-muted-foreground">
                      {it.assessment}
                    </span>
                    <span className="font-medium">
                      {it.obtained}
                      <span className="text-muted-foreground">/{it.maxMark}</span>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// The full week, collapsed by default — the today strip covers the common case, so
// the grid is a details drawer the student expands only when they want the whole
// week.
function WeeklyTimetable({ slots }: { slots: PortalSlot[] }) {
  if (slots.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <SectionHeader title="Weekly timetable" />
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          No timetable published for your class yet.
        </p>
      </section>
    );
  }
  const byCell = new Map(slots.map((s) => [`${s.dayOfWeek}-${s.period}`, s]));
  const todayKey = TODAY_KEY[new Date().getDay()];

  return (
    <details className="group flex flex-col gap-3">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <h2 className="font-heading text-sm font-semibold text-foreground">Weekly timetable</h2>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          Full week
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
        </span>
      </summary>
      <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-160 border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
              <th className="w-14 px-3 py-2 font-medium">Period</th>
              {WEEKDAYS.map((d) => (
                <th
                  key={d}
                  className={`px-3 py-2 font-medium ${d === todayKey ? "text-primary" : ""}`}
                >
                  {WEEKDAY_LABEL[d]}
                  {d === todayKey && <span className="ml-1 text-[0.6rem]">• today</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <tr key={p} className="h-16 border-b border-foreground/10 last:border-b-0">
                <td className="px-3 align-middle font-mono text-xs text-muted-foreground">P{p}</td>
                {WEEKDAYS.map((d) => {
                  const slot = byCell.get(`${d}-${p}`);
                  const isToday = d === todayKey;
                  return (
                    <td key={d} className={`p-2 align-middle ${isToday ? "bg-primary/3" : ""}`}>
                      {slot ? (
                        <div className="flex flex-col rounded-md bg-primary/5 px-2 py-1.5 ring-1 ring-primary/15">
                          <span className="text-sm font-medium leading-tight">
                            {slot.subjectCode}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {slot.facultyName}
                          </span>
                        </div>
                      ) : (
                        <span className="flex justify-center text-muted-foreground/40">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
