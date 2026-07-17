// The authenticated landing content — a placeholder for the real per-role
// dashboards. Renders inside AuthGate, so by the time it mounts the user is
// provisioned and past the first-login reset. Shows who they are and lets them
// sign out; real feature dashboards replace this in a later phase.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useFirebaseUser, useMe, useSignOut } from "@/features/auth/hooks/use-auth";

export function DashboardHome() {
  const router = useRouter();
  const { firebaseUser } = useFirebaseUser();
  const me = useMe(!!firebaseUser);
  const signOut = useSignOut();

  const profile = me.data;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1.5">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-primary">
          Session · Verified
        </span>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Welcome{profile ? `, ${profile.displayName.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          You’re signed in. Your role-specific dashboard opens here once that phase ships.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <InfoCard label="Signed in as" value={profile?.email ?? "…"} />
        <InfoCard
          label="Roles"
          value={profile?.roles.length ? profile.roles.join(" · ") : "None assigned yet"}
        />
        <InfoCard
          label="Department"
          value={profile?.departmentId ?? "All departments (unscoped)"}
        />
        <InfoCard label="Account" value={profile ? "Active" : "…"} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {profile?.roles.includes("Super Admin") && (
          <Button size="lg" className="h-11" render={<Link href="/admin" />}>
            Open admin console
          </Button>
        )}
        <Button
          variant="outline"
          size="lg"
          className="h-11"
          onClick={() =>
            signOut.mutate(undefined, { onSuccess: () => router.replace("/login") })
          }
        >
          Sign out
        </Button>
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-4">
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-sm text-foreground">{value}</span>
    </div>
  );
}
