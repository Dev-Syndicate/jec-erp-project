// The Dashboard's charts. Every one of them plots rows returned by
// GET /api/dashboard/analytics — there is no sample series anywhere in this file.
//
// ── A colour note that governs the whole file ──────────────────────────────────
// The attendance statuses use the FIXED --status-* tokens (green / red / amber /
// violet) because they encode meaning rather than brand. Measured against the
// palette checks, that quartet has one real weakness: PRESENT (green) and OD
// (amber) sit ΔE 4.5 apart under simulated protanopia — far below the ΔE 8 a
// categorical palette needs. Normal vision separates them fine (ΔE 19.9), and the
// tokens are load-bearing across the attendance screens, so they are not ours to
// re-step here.
//
// The consequence is a rule this file follows without exception: COLOUR IS NEVER
// THE ONLY ENCODING. Every mark that carries a status is accompanied by its
// number and its name in text — the ring has a labelled breakdown beside it
// rather than a four-way legend, and every bar is direct-labelled with its
// percentage. Read in greyscale, or by a reader who cannot separate green from
// amber, none of these charts loses information.
"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { AXIS_PROPS, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import type { AttendanceBand, ClassStanding, TrendPoint } from "@/features/dashboard/types";

/**
 * The eligibility bands, as CSS colours rather than classes — an SVG `fill`
 * cannot take a Tailwind class.
 *
 * These boundaries mirror the student portal's, deliberately: a class at 74%
 * must read as short on the admin dashboard and on the student's own screen. They
 * are a college rule, not a palette choice. Kept separate from
 * /attendance/report's banding, which measures against a threshold the user
 * types in — merging the two would silently change which classes look at risk.
 */
export function bandVar(pct: number | null, threshold: number): string {
  if (pct === null) return "var(--muted-foreground)";
  if (pct >= threshold) return "var(--status-present)";
  if (pct >= 65) return "var(--status-od)";
  return "var(--status-absent)";
}

const DATE_LABEL = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const shortDate = (iso: string) => DATE_LABEL.format(new Date(`${iso}T00:00:00Z`));

// ── Attendance over time ─────────────────────────────────────────────────────

/**
 * Daily attendance percentage across the scope, over the recorded days.
 *
 * The axis runs the full 0–100 rather than zooming to the data's own range. A
 * truncated axis would turn a two-point wobble into a cliff, and the question
 * this chart answers is "are we above the line", which needs the line in frame.
 *
 * Only days that HAVE records are plotted. A holiday is absent from the series
 * rather than drawn as 0% — an invented collapse is worse than a gap.
 */
export function AttendanceTrendChart({
  trend,
  threshold,
}: {
  trend: TrendPoint[];
  threshold: number;
}) {
  if (trend.length < 2) {
    return (
      <EmptyState
        size="sm"
        title="Not enough attendance recorded yet to plot a trend."
      />
    );
  }

  const data = trend.map((p) => ({ ...p, label: shortDate(p.date) }));

  return (
    <ChartContainer
      height={288}
      label={`Daily attendance percentage over the last ${trend.length} recorded days, against the ${threshold}% eligibility line. Latest: ${data[data.length - 1].pct}%.`}
    >
      {/* `left: 0`, not a negative pull. Shaving the gutter clips the "100%"
          tick to "00%" — the axis needs its full declared width. */}
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="dash-attendance-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          {...AXIS_PROPS}
          // Let Recharts drop colliding ticks rather than computing a fixed
          // stride here: a stride that reads well at 1440px runs the dates into
          // each other at 390px, and this chart is half as wide on a phone.
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis domain={[0, 100]} unit="%" width={46} {...AXIS_PROPS} />
        {/* Unlabelled: the y-axis already prints 75%, and a label on the line
            itself was overflowing the plot area and clipping to "7". The panel
            hint names the line in words. */}
        <ReferenceLine
          y={threshold}
          stroke="var(--foreground)"
          strokeOpacity={0.45}
          strokeDasharray="4 4"
        />
        <Area
          type="monotone"
          dataKey="pct"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#dash-attendance-fill)"
          // A single-point marker would be lost in a 30-day series; the active
          // dot on hover is what the reader actually aims at.
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          isAnimationActive={false}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.15, strokeWidth: 1 }}
          formatter={(v, _n, item) => {
            const p = item?.payload as TrendPoint | undefined;
            return [p ? `${v}%  (${p.attended}/${p.total} present)` : `${v}%`, "Attendance"];
          }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

// ── Composition ──────────────────────────────────────────────────────────────

const BREAKDOWN = [
  { key: "present", label: "Present", color: "var(--status-present)" },
  { key: "absent", label: "Absent", color: "var(--status-absent)" },
  { key: "od", label: "On duty", color: "var(--status-od)" },
  { key: "excused", label: "Excused", color: "var(--status-excused)" },
] as const;

/**
 * The attendance rate as a ring, with the four statuses listed beside it.
 *
 * The ring is deliberately TWO slices — attended against the remainder — not a
 * four-way pie. That is what makes it readable: a two-slice ring is a meter, so
 * the reader gets the headline rate from the shape, and the four-way detail
 * arrives as text where a name and a number sit next to each colour chip. A
 * four-slice ring would have put the whole weight of "which slice is OD" on the
 * green/amber pair the palette check flags (see the file header).
 */
export function AttendanceRing({
  composition,
  threshold,
}: {
  composition: {
    present: number;
    absent: number;
    od: number;
    excused: number;
    total: number;
    attended: number;
  };
  threshold: number;
}) {
  const { total, attended } = composition;
  if (total === 0) {
    return <EmptyState size="sm" title="No attendance recorded this semester yet." />;
  }

  const pct = Math.round((attended / total) * 100);
  const data = [
    { name: "Attended", value: attended, color: bandVar(pct, threshold) },
    { name: "Not attended", value: total - attended, color: "var(--muted)" },
  ];

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="relative mx-auto w-full max-w-44">
        <ChartContainer
          height={168}
          label={`Attendance rate ${pct}%. ${BREAKDOWN.map((b) => `${b.label} ${composition[b.key]}`).join(", ")} of ${total} day records.`}
        >
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="72%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              // A 2px gap between the two fills, so the join reads as an edge
              // rather than a colour change.
              paddingAngle={data[1].value > 0 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        {/* The hero figure lives in the hole. `pointer-events-none` so it never
            eats a hover meant for the ring. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-3xl font-semibold leading-none tabular-nums text-foreground">
            {pct}%
          </span>
          <span className="mt-1 text-[0.7rem] text-muted-foreground">attended</span>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5">
        {BREAKDOWN.map((b) => {
          const value = composition[b.key];
          return (
            <li key={b.key} className="flex items-center gap-2 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: b.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{b.label}</span>
              <span className="tabular-nums font-medium">{value.toLocaleString("en-IN")}</span>
              <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">
                {total > 0 ? `${Math.round((value / total) * 100)}%` : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Per-class standing ───────────────────────────────────────────────────────

/**
 * Attendance by class, worst first.
 *
 * Sorted ascending rather than alphabetically because the reason to open this
 * panel is to find the class that needs attention — the top of the list should
 * be the answer, not the letter A.
 *
 * A meter list rather than a bar chart, and that was a correction rather than a
 * preference: as a horizontal Recharts bar chart the value labels sat at the end
 * of each bar, so a class on 71% or 74% had the dashed 75% rule drawn straight
 * through its own number. A list puts the label in its own column, where nothing
 * can reach it, and has room for the roster size besides — which is what turns
 * "62%" into "how many students is that". The notch is the same 75% mark the
 * student portal draws on its own meter.
 */
export function ClassStandingsChart({
  classes,
  threshold,
}: {
  classes: ClassStanding[];
  threshold: number;
}) {
  const data = classes
    .filter((c) => c.pct !== null)
    .map((c) => ({ ...c, pct: c.pct as number }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 8);

  if (data.length === 0) {
    return (
      <EmptyState size="sm" title="No class has attendance recorded for this semester yet." />
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((c) => (
        <li key={c.classId} className="flex items-center gap-3 text-sm">
          <span className="w-20 shrink-0 truncate font-mono text-xs text-muted-foreground">
            {c.label}
          </span>
          <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${c.pct}%`, background: bandVar(c.pct, threshold) }}
            />
            <span
              className="absolute inset-y-0 w-px bg-foreground/40"
              style={{ left: `${threshold}%` }}
              aria-hidden
            />
          </span>
          <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
            {c.pct}%
          </span>
          <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:inline">
            {c.students} std
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Distribution ─────────────────────────────────────────────────────────────

/**
 * How many students sit in each attendance band.
 *
 * A column chart rather than a percentage: the reader wants the head-count in
 * the red bands, because that is the number of conversations someone has to
 * have. Counts are printed above every column for the same reason the class
 * bars are labelled.
 */
export function BandDistributionChart({
  bands,
  threshold,
}: {
  bands: AttendanceBand[];
  threshold: number;
}) {
  const total = bands.reduce((a, b) => a + b.students, 0);
  if (total === 0) {
    return <EmptyState size="sm" title="No student has enough attendance recorded to band yet." />;
  }

  // The band's own lower bound decides its colour, so the chart agrees with the
  // class bars and the student portal about where 65 and 75 fall.
  const lower: Record<string, number> = { critical: 0, short: 50, watch: 65, safe: 75, strong: 90 };

  return (
    <ChartContainer
      height={244}
      label={`Students by attendance band: ${bands.map((b) => `${b.label} ${b.students}`).join(", ")}.`}
    >
      {/* `left: 0` for the same reason as the trend chart — a negative gutter
          clips a three-digit tick ("214" → "14"). */}
      <BarChart data={bands} margin={{ top: 20, right: 4, bottom: 0, left: 0 }}>
        <XAxis dataKey="label" {...AXIS_PROPS} interval={0} tick={{ ...AXIS_PROPS.tick, fontSize: 10 }} />
        <YAxis allowDecimals={false} width={40} {...AXIS_PROPS} />
        <Bar dataKey="students" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
          {bands.map((b) => (
            <Cell key={b.key} fill={bandVar(lower[b.key] ?? 0, threshold)} />
          ))}
          <LabelList
            dataKey="students"
            position="top"
            offset={6}
            fill="var(--muted-foreground)"
            fontSize={11}
          />
        </Bar>
        <ChartTooltip formatter={(v) => [`${v} students`, "In this band"]} />
      </BarChart>
    </ChartContainer>
  );
}
