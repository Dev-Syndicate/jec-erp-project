// Staff Overview — the signed-in staff member's live landing: today's classes
// (their schedule for the day, with a link to mark), an admin snapshot of
// student/faculty/class counts (manage-Student holders only), and quick links.
// Data-driven from GET /api/me/staff-overview — real work, not placeholders.
"use client";

import Link from "next/link";
import {
  CalendarCheck2,
  CalendarClock,
  UsersRound,
  GraduationCap,
  Building2,
  ArrowRight,
} from "lucide-react";

import { useStaffOverview } from "@/features/dashboard/hooks/use-dashboard";
import type { StaffOverview, TodayClass } from "@/features/dashboard/types";

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

export function StaffDashboard({ firstName }: { firstName?: string }) {
  const date = todayStr();
  const { data, isPending, isError } = useStaffOverview(date);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-primary">
          {DATE_FMT.format(new Date())}
          {data?.semesterLabel ? ` · ${data.semesterLabel}` : ""}
        </span>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {firstName ? `Good to see you, ${firstName}` : "Welcome"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Your day at a glance — jump into today&apos;s work from here.
        </p>
      </header>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading your overview…</p>
      ) : isError || !data ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load your overview.</p>
      ) : (
        <Content data={data} />
      )}
    </main>
  );
}

function Content({ data }: { data: StaffOverview }) {
  const isAdmin = data.stats !== null;
  // Show "Today's classes" for staff who teach; hide the empty section for a pure
  // admin who has no classes today (they get the snapshot instead).
  const showToday = data.todayClasses.length > 0 || !isAdmin;

  return (
    <div className="flex flex-col gap-8">
      {data.stats && <Snapshot stats={data.stats} />}

      {showToday && (
        <Section title="Today's classes">
          {data.weekend ? (
            <Empty>It&apos;s the weekend — no scheduled classes.</Empty>
          ) : data.todayClasses.length === 0 ? (
            <Empty>No classes scheduled for you today.</Empty>
          ) : (
            <div className="flex flex-col divide-y divide-foreground/10 rounded-xl ring-1 ring-foreground/10">
              {data.todayClasses.map((c) => (
                <TodayRow key={`${c.classId}-${c.period}`} c={c} />
              ))}
            </div>
          )}
        </Section>
      )}

      <Section title="Quick links">
        <div className="flex flex-wrap gap-2">
          <QuickLink href="/attendance" icon={CalendarCheck2} label="Mark attendance" />
          <QuickLink href="/attendance/timetable" icon={CalendarClock} label="My timetable" />
          {data.advisesClass && <QuickLink href="/my-class" icon={UsersRound} label="My class" />}
          {isAdmin && <QuickLink href="/students" icon={GraduationCap} label="Students" />}
          {isAdmin && <QuickLink href="/structure/degrees" icon={Building2} label="Structure" />}
        </div>
      </Section>
    </div>
  );
}

function Snapshot({ stats }: { stats: NonNullable<StaffOverview["stats"]> }) {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <Stat label="Students" value={stats.students} />
      <Stat label="Faculty" value={stats.faculty} />
      <Stat label="Classes" value={stats.classes} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-heading text-3xl font-semibold text-foreground">{value}</span>
    </div>
  );
}

function TodayRow({ c }: { c: TodayClass }) {
  return (
    <Link
      href="/attendance"
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
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
      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
        Mark <ArrowRight className="size-3.5" />
      </span>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
