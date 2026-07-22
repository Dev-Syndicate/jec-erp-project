// The authenticated overview — renders inside the app shell (which owns the
// rail, context bar, and sign-out). Its job is to point staff at today's work,
// scoped to their role: a greeting, quick-access tiles into the daily flows,
// and an account card. Work cards are honest placeholders until the leave /
// announcements phases wire real data; each states what it WILL show and why
// it's empty, rather than faking a number.
//
// Visual language: tinted canvas (muted token), white rounded cards with soft
// shadows, accent icon circles, ONE brand-filled tile. Everything derives from
// the token system — no hardcoded colors.
"use client";

import Link from "next/link";
import {
  CalendarCheck,
  CalendarRange,
  FileClock,
  GraduationCap,
  Megaphone,
  Users,
} from "lucide-react";

import { useFirebaseUser, useMe } from "@/features/auth/hooks/use-auth";

export function DashboardHome() {
  const { firebaseUser } = useFirebaseUser();
  const me = useMe(!!firebaseUser);
  const profile = me.data;
  const firstName = profile?.displayName.split(" ")[0];
  const roles = profile?.roles ?? [];
  const isAdmin = roles.includes("Super Admin");
  // Students get the work cards but not the staff shortcuts (those routes 403).
  const isStaff = roles.some((r) => r !== "Student");

  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-1.5">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-primary">
            {new Intl.DateTimeFormat("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date())}
          </span>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
            {firstName ? `Good to see you, ${firstName}` : "Welcome"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Manage the institution from the sidebar. Day-to-day flows open up below."
              : "Your section work shows up here as each part of the ERP comes online."}
          </p>
        </header>

        {isStaff && (
          <section aria-label="Quick access" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <QuickTile
              icon={CalendarCheck}
              label="Mark attendance"
              sub="Today's periods"
              href="/attendance"
            />
            <QuickTile icon={Users} label="Students" sub="Records & import" href="/students" />
            <QuickTile icon={GraduationCap} label="Faculty" sub="Accounts & roles" href="/faculty" />
            <QuickTile
              icon={CalendarRange}
              label="Timetable"
              sub="The weekly grid"
              href="/timetable"
              filled
            />
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="grid content-start gap-4 sm:grid-cols-2">
            <WorkCard
              icon={CalendarCheck}
              title="Attendance"
              detail="Your assigned sections for today list here to mark."
              state="Live — open Mark attendance"
            />
            <WorkCard
              icon={FileClock}
              title="Leave & OD"
              detail="Requests awaiting your approval land here, oldest first."
              state="Opens with the leave phase"
            />
            <WorkCard
              icon={Megaphone}
              title="Announcements"
              detail="Notices for your program and classes appear here."
              state="Opens with the announcements phase"
            />
          </div>

          <ProfileCard profile={profile} />
        </section>
      </div>
    </main>
  );
}

// A quick-access tile — the reference's stat-tile row, played by real
// navigation into the daily flows. Exactly one tile is brand-filled.
function QuickTile({
  icon: Icon,
  label,
  sub,
  href,
  filled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  href: string;
  filled?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3.5 rounded-2xl p-5 shadow-xs transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
        filled
          ? "bg-primary text-primary-foreground"
          : "border border-border/60 bg-card text-foreground"
      }`}
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-full ${
          filled ? "bg-primary-foreground/15" : "bg-accent"
        }`}
      >
        <Icon className={`size-4 ${filled ? "" : "text-accent-foreground"}`} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">{label}</span>
        <span
          className={`font-mono text-[0.65rem] uppercase tracking-[0.14em] ${
            filled ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {sub}
        </span>
      </span>
    </Link>
  );
}

function WorkCard({
  icon: Icon,
  title,
  detail,
  state,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  state: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-full bg-accent">
          <Icon className="size-4 text-accent-foreground" />
        </span>
        <h2 className="font-heading text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <p className="flex-1 text-sm text-muted-foreground">{detail}</p>
      <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground/70">
        {state}
      </span>
    </div>
  );
}

// The reference's profile card, with the account's real facts: who you are,
// how you're signed in, and what your roles let you do.
function ProfileCard({
  profile,
}: {
  profile: { displayName: string; email: string; roles: string[] } | undefined;
}) {
  const initials = (profile?.displayName ?? "· ·")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="flex flex-col items-center gap-4 rounded-2xl border border-border/60 bg-card p-6 text-center shadow-xs">
      <span className="grid size-16 place-items-center rounded-full bg-primary/10 font-heading text-lg font-semibold text-primary">
        {initials}
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="font-heading text-base font-semibold text-foreground">
          {profile?.displayName ?? "…"}
        </p>
        <p className="truncate text-sm text-muted-foreground">{profile?.email ?? ""}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {(profile?.roles.length ? profile.roles : ["No roles yet"]).map((r) => (
          <span
            key={r}
            className="rounded-full bg-accent px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-accent-foreground"
          >
            {r}
          </span>
        ))}
      </div>
      <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
        Your roles decide what the sidebar shows and what the server lets you change.
      </p>
    </aside>
  );
}
