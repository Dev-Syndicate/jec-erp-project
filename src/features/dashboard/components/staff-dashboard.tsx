// Staff Overview — the signed-in staff member's live landing.
//
// TWO QUERIES, DELIBERATELY SEPARATE.
//   /api/me/staff-overview  — who am I, what am I teaching today, quick links.
//                             Unchanged; it is what this screen has always shown.
//   /api/dashboard/analytics — the KPI row and the charts, for staff who manage
//                             students (Super Admin / HOD).
// Splitting them means the analytics — much the heavier of the two — can be slow
// or fail outright and the staff member still gets today's classes and their
// links. The old three-count snapshot is still rendered as the fallback in that
// case, so nothing this screen used to show can disappear.
//
// Everything here is real: each number is computed from rows in the active
// semester, and anything not yet derivable renders as an em dash rather than a
// zero.
"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarCheck2,
  CalendarClock,
  ClipboardCheck,
  FileClock,
  GraduationCap,
  TrendingUp,
  UsersRound,
} from "lucide-react";

import { CardSkeleton, StatCardSkeleton } from "@/components/ui/skeleton";
import { StatCard, StatCardGrid, StatDelta } from "@/components/ui/stat-card";
import {
  AttendanceRing,
  AttendanceTrendChart,
  BandDistributionChart,
  ClassStandingsChart,
  YearMixList,
} from "@/features/dashboard/components/dashboard-charts";
import { DashboardPanel } from "@/features/dashboard/components/dashboard-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/form-error";
import { PageShell } from "@/app/(app)/page-shell";
import {
  useDashboardAnalytics,
  useStaffOverview,
} from "@/features/dashboard/hooks/use-dashboard";
import type {
  AdminAnalytics,
  DashboardAnalytics,
  StaffOverview,
  TodayClass,
} from "@/features/dashboard/types";

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const num = (n: number) => n.toLocaleString("en-IN");

export function StaffDashboard({ firstName }: { firstName?: string }) {
  const date = todayStr();
  const overview = useStaffOverview(date);
  const analytics = useDashboardAnalytics(date);

  const scope = analytics.data?.scopeLabel;

  return (
    <PageShell className="gap-6">
      {/* Hand-rolled rather than <PageHeader> because the eyebrow here is live
          data (today's date, the active semester, the viewer's scope) and the
          title greets the user — neither is the fixed "Section · Page" that
          PageHeader models. */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow text-primary">
            {DATE_FMT.format(new Date())}
            {overview.data?.semesterLabel ? ` · ${overview.data.semesterLabel}` : ""}
            {scope ? ` · ${scope}` : ""}
          </span>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {firstName ? `Good to see you, ${firstName}` : "Welcome"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Your day at a glance — jump into today&apos;s work from here.
          </p>
        </div>
      </header>

      {overview.isPending ? (
        <>
          <StatCardSkeleton count={4} label="Loading your overview…" />
          <CardSkeleton count={2} lines={5} />
        </>
      ) : overview.isError || !overview.data ? (
        <FormError>Couldn&apos;t load your overview.</FormError>
      ) : (
        <Content overview={overview.data} analytics={analytics} />
      )}
    </PageShell>
  );
}

function Content({
  overview,
  analytics,
}: {
  overview: StaffOverview;
  analytics: ReturnType<typeof useDashboardAnalytics>;
}) {
  // `stats` non-null is the server's own answer to "is this an admin", and it is
  // what has always decided whether the snapshot renders. Kept as the gate so
  // the layout doesn't change shape while the analytics query is still in
  // flight.
  const isAdmin = overview.stats !== null;
  const data: DashboardAnalytics | undefined = analytics.data;
  const admin = data?.admin ?? null;

  // Show "Today's classes" for staff who teach; hide the empty section for a
  // pure admin who has no classes today (they get the analytics instead).
  const showToday = overview.todayClasses.length > 0 || !isAdmin;

  // Which of the viewer's own hours today already have a register — so a teacher
  // can see at a glance that period 5 is still unmarked.
  const markedToday = new Set(
    (data?.teaching?.markedToday ?? []).map((m) => `${m.classId}:${m.period}`),
  );

  return (
    <div className="flex flex-col gap-6">
      {isAdmin && (
        <>
          {analytics.isPending ? (
            <>
              <StatCardSkeleton count={4} label="Loading dashboard analytics…" />
              <CardSkeleton count={2} lines={6} />
            </>
          ) : analytics.isError || !admin ? (
            // The analytics failed but the overview didn't. Fall back to the
            // three counts this screen has always had, and say why the rest is
            // missing rather than showing a blank band.
            <>
              <Snapshot stats={overview.stats!} />
              <FormError>
                Couldn&apos;t load the dashboard analytics. The counts above are still live.
              </FormError>
            </>
          ) : data?.noActiveSemester ? (
            <>
              <Snapshot stats={overview.stats!} />
              <EmptyState
                size="sm"
                title="No semester is active, so there's nothing time-bound to chart yet."
              />
            </>
          ) : (
            <AdminAnalyticsView admin={admin} />
          )}
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {showToday && (
          <DashboardPanel
            title="Today's classes"
            hint={
              overview.weekend
                ? "Weekend"
                : overview.todayClasses.length > 0
                  ? `${overview.todayClasses.length} scheduled`
                  : undefined
            }
            className={isAdmin ? "lg:col-span-2" : "lg:col-span-3"}
          >
            {overview.weekend ? (
              <EmptyState size="sm" title="It's the weekend — no scheduled classes." />
            ) : overview.todayClasses.length === 0 ? (
              <EmptyState size="sm" title="No classes scheduled for you today." />
            ) : (
              <div className="flex flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg ring-1 ring-foreground/10">
                {overview.todayClasses.map((c) => (
                  <TodayRow
                    key={`${c.classId}-${c.period}`}
                    c={c}
                    // `undefined` while analytics is still loading, so the row
                    // shows no badge at all rather than flashing "Not marked"
                    // at a teacher who has in fact marked it.
                    marked={
                      analytics.isSuccess ? markedToday.has(`${c.classId}:${c.period}`) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </DashboardPanel>
        )}

        {/* Quick links share the row with today's classes only for an admin,
            where the classes panel is two columns wide. Otherwise it is the
            row's only panel and takes the full width. */}
        <DashboardPanel
          title="Quick links"
          className={showToday && isAdmin ? "" : "lg:col-span-3"}
        >
          <div className="flex flex-wrap gap-2">
            <QuickLink href="/attendance" icon={CalendarCheck2} label="Mark attendance" />
            {overview.teaches && (
              <QuickLink href="/attendance/timetable" icon={CalendarClock} label="My timetable" />
            )}
            {overview.advisesClass && (
              <QuickLink href="/my-class" icon={UsersRound} label="My class" />
            )}
            {isAdmin && <QuickLink href="/students" icon={GraduationCap} label="Students" />}
            {isAdmin && <QuickLink href="/structure/degrees" icon={Building2} label="Structure" />}
          </div>
        </DashboardPanel>
      </div>
    </div>
  );
}

// ── The analytics block ──────────────────────────────────────────────────────

function AdminAnalyticsView({ admin }: { admin: AdminAnalytics }) {
  const h = admin.headline;
  const threshold = admin.threshold;

  // Only render a delta when there are two comparable measurements behind it.
  const studentDelta =
    h.studentsPrior !== null && h.studentsPrior > 0
      ? Math.round(((h.students - h.studentsPrior) / h.studentsPrior) * 100)
      : null;
  const attendanceDelta =
    h.recentPct !== null && h.priorPct !== null ? h.recentPct - h.priorPct : null;

  const pending = h.pendingTeacher + h.pendingHod;
  const atRiskShare = h.atRiskOf > 0 ? Math.round((h.atRisk / h.atRiskOf) * 100) : null;

  // Super Admin is not part of the leave/OD approval chain (class teacher, then
  // HOD), so a pending count they cannot act on is noise on their dashboard.
  // HODs, who are the second stage, keep the tile.
  const showPending = !admin.unscoped;

  return (
    <div className="flex flex-col gap-4">
      <StatCardGrid className={showPending ? undefined : "lg:grid-cols-3"}>
        <StatCard
          label="Students on roll"
          value={num(h.students)}
          icon={GraduationCap}
          href="/students"
          hint={
            studentDelta !== null ? (
              <StatDelta value={studentDelta} label={`vs ${h.priorYearName}`} />
            ) : (
              "Enrolled this academic year"
            )
          }
        />
        <StatCard
          label="Attendance rate"
          value={h.attendancePct === null ? "—" : `${h.attendancePct}%`}
          icon={TrendingUp}
          tone={
            h.attendancePct === null
              ? "default"
              : h.attendancePct >= threshold
                ? "success"
                : "warning"
          }
          hint={
            attendanceDelta !== null ? (
              <StatDelta
                value={attendanceDelta}
                unit=" pts"
                label={`vs prior ${admin.window} days`}
              />
            ) : (
              `${num(h.attendanceDays)} day records this semester`
            )
          }
        />
        <StatCard
          label={`Below ${threshold}%`}
          value={num(h.atRisk)}
          icon={AlertTriangle}
          tone={h.atRisk > 0 ? "destructive" : "success"}
          hint={
            atRiskShare === null
              ? "No attendance measured yet"
              : `${atRiskShare}% of ${num(h.atRiskOf)} students measured`
          }
        />
        {showPending && (
          <StatCard
            label="Pending approvals"
            value={num(pending)}
            icon={FileClock}
            href="/leave"
            tone={pending > 0 ? "warning" : "default"}
            hint={
              pending === 0
                ? "Nothing waiting"
                : `${h.pendingTeacher} class teacher · ${h.pendingHod} HOD`
            }
          />
        )}
      </StatCardGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <DashboardPanel
          title="Attendance trend"
          // The dashed rule on the chart is named here rather than labelled on
          // the line, where it overflowed the plot area.
          hint={`Last ${admin.trend.length} recorded days · dashed line is the ${threshold}% mark`}
          href="/attendance/report"
          hrefLabel="Full report"
          className="lg:col-span-2"
        >
          <AttendanceTrendChart trend={admin.trend} threshold={threshold} />
        </DashboardPanel>

        <DashboardPanel title="Attendance breakdown" hint="This semester">
          <AttendanceRing composition={admin.composition} threshold={threshold} />
        </DashboardPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <DashboardPanel
          title="Classes needing attention"
          hint="Lowest attendance first"
          href="/attendance/report"
          hrefLabel="All classes"
          className="lg:col-span-2"
        >
          <ClassStandingsChart classes={admin.classes} threshold={threshold} />
        </DashboardPanel>

        <div className="flex flex-col gap-4">
          <DashboardPanel title="Today's marking" hint="Scheduled hours with a register">
            <MarkingProgress
              scheduled={h.scheduledToday}
              marked={h.markedToday}
              isWorkingDay={h.isWorkingDay}
            />
          </DashboardPanel>
          <DashboardPanel title="Faculty & classes" hint={`${num(h.faculty)} staff`}>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Faculty" value={num(h.faculty)} href="/faculty" />
              <MiniStat label="Classes" value={num(h.classes)} href="/structure/classes" />
            </div>
          </DashboardPanel>
        </div>
      </div>

      {/* Same 2 + 1 split as the two rows above, so all three rows share one
          column rule down the page. Full-width, the five band columns were
          marooned in whitespace. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <DashboardPanel
          title="Students by attendance band"
          hint={`${num(h.atRiskOf)} students with day records this semester`}
          className="lg:col-span-2"
        >
          <BandDistributionChart bands={admin.bands} threshold={threshold} />
        </DashboardPanel>

        <DashboardPanel title="Students by year" hint={`${num(h.students)} on roll`}>
          <YearMixList yearMix={admin.yearMix} />
        </DashboardPanel>
      </div>
    </div>
  );
}

/**
 * Today's registers: how many scheduled hours have been marked.
 *
 * A meter rather than a percentage tile, because the useful reading is "3 hours
 * still open", not "62%". On a day with no timetable (Sunday, an undeclared
 * Saturday) it says so — "0 of 0" would read as a failure to mark rather than
 * as a day off.
 */
function MarkingProgress({
  scheduled,
  marked,
  isWorkingDay,
}: {
  scheduled: number;
  marked: number;
  isWorkingDay: boolean;
}) {
  if (!isWorkingDay) {
    return <EmptyState size="sm" title="Not a working day — no hours scheduled." />;
  }
  if (scheduled === 0) {
    return <EmptyState size="sm" title="No hours are timetabled for today." />;
  }

  const pct = Math.round((marked / scheduled) * 100);
  const open = scheduled - marked;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-2">
        <span className="font-heading text-3xl font-semibold leading-none tabular-nums">
          {marked}
          <span className="text-lg text-muted-foreground">/{scheduled}</span>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] ${
            open === 0 ? "bg-status-present" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {open === 0
          ? "Every scheduled hour is marked."
          : `${open} hour${open === 1 ? "" : "s"} still open.`}
      </p>
    </div>
  );
}

function MiniStat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-heading text-xl font-semibold leading-none tabular-nums">{value}</span>
    </Link>
  );
}

// The admin snapshot, kept as the fallback for when the analytics query fails.
// Each tile links to the screen that manages what it counts — every one of these
// routes is Super-Admin/HOD, the same audience `stats` itself is non-null for, so
// no tile can lead somewhere the viewer would 403.
function Snapshot({ stats }: { stats: NonNullable<StaffOverview["stats"]> }) {
  return (
    <StatCardGrid className="lg:grid-cols-3">
      <StatCard
        label="Students"
        value={num(stats.students)}
        icon={GraduationCap}
        href="/students"
        hint="Enrolled this academic year"
      />
      <StatCard
        label="Faculty"
        value={num(stats.faculty)}
        icon={UsersRound}
        href="/faculty"
        hint="Active staff accounts"
      />
      <StatCard
        label="Classes"
        value={num(stats.classes)}
        icon={Building2}
        href="/structure/classes"
        hint="Groups taking attendance"
      />
    </StatCardGrid>
  );
}

function TodayRow({ c, marked }: { c: TodayClass; marked?: boolean }) {
  return (
    <Link
      href="/attendance"
      className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted"
    >
      <span className="grid w-10 shrink-0 place-items-center rounded-md bg-primary/5 py-1 font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground ring-1 ring-primary/15">
        P{c.period}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">
          {c.subjectCode} · {c.classShort}
        </span>
        <span className="truncate text-xs text-muted-foreground">{c.subjectName}</span>
      </div>
      {marked === undefined ? null : marked ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-success-surface px-2 py-0.5 text-xs font-medium text-success">
          <ClipboardCheck className="size-3.5" aria-hidden />
          Marked
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          Mark <ArrowRight className="size-3.5" aria-hidden />
        </span>
      )}
    </Link>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
    >
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </Link>
  );
}
