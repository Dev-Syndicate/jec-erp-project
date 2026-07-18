// The authenticated overview — renders inside the app shell (which owns the
// rail, context bar, and sign-out). Its job is to point staff at today's work,
// scoped to their role. Cards are honest placeholders until the attendance /
// leave / announcements phases wire real data; each states what it WILL show and
// why it's empty, rather than faking a number.
"use client";

import { CalendarCheck, FileClock, Megaphone } from "lucide-react";

import { useFirebaseUser, useMe } from "@/features/auth/hooks/use-auth";

export function DashboardHome() {
  const { firebaseUser } = useFirebaseUser();
  const me = useMe(!!firebaseUser);
  const profile = me.data;
  const firstName = profile?.displayName.split(" ")[0];
  const isAdmin = profile?.roles.includes("Super Admin");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-primary">
          {new Intl.DateTimeFormat("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date())}
        </span>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {firstName ? `Good to see you, ${firstName}` : "Welcome"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Manage the institution from the sidebar. Day-to-day flows open up below."
            : "Your section work shows up here as each part of the ERP comes online."}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <WorkCard
          icon={CalendarCheck}
          title="Attendance"
          detail="Your assigned sections for today will list here to mark."
          state="Opens with the attendance phase"
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
          detail="Notices for your department and sections appear here."
          state="Opens with the announcements phase"
        />
      </section>
    </main>
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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="font-heading text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <p className="flex-1 text-sm text-muted-foreground">{detail}</p>
      <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground/70">
        {state}
      </span>
    </div>
  );
}
