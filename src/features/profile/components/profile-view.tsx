// The signed-in user's own profile page: identity (name, email, roles, account
// status), their program, and the role-specific record (faculty HR fields or
// student register detail). Read-only — edits to these live with the class
// teacher / HOD / Admin tools, not here. Sign-out stays in the app shell.
"use client";

import { PageHeader } from "@/app/(app)/page-header";
import { useProfile } from "@/features/profile/hooks/use-profile";
import type { Profile } from "@/features/profile/types";

// Title-case a SCREAMING_ENUM value for display ("ASST_PROFESSOR" isn't used —
// these are single tokens like ACTIVE / MALE / MARRIED).
function humanize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

const isoToDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "· ·"
  );
}

// One label/value row. Values that are absent render as an em dash so the grid
// stays aligned rather than collapsing.
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-40 shrink-0 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value || "—"}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <h2 className="border-b border-border px-5 py-3 font-heading text-sm font-semibold text-foreground">
        {title}
      </h2>
      <div className="divide-y divide-border/60 px-5 py-1">{children}</div>
    </section>
  );
}

function IdentityCard({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5">
      <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-sidebar-accent font-mono text-lg font-semibold text-sidebar-accent-foreground">
        {initialsOf(profile.displayName)}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate font-heading text-lg font-semibold text-foreground">
          {profile.displayName}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {profile.roles.length ? (
            profile.roles.map((role) => (
              <span
                key={role}
                className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-primary"
              >
                {role}
              </span>
            ))
          ) : (
            <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              No role
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProfileView() {
  const { data: profile, isPending, isError } = useProfile();

  if (isPending) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          Loading your profile…
        </div>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <PageHeader
          eyebrow="Account"
          title="Your profile"
          description="We couldn’t load your profile just now."
        />
        <p className="text-sm text-muted-foreground">Refresh the page to try again.</p>
      </div>
    );
  }

  const { faculty, student, program } = profile;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Account"
        title="Your profile"
        description="Your account and contact details as they’re held in the ERP."
      />

      <IdentityCard profile={profile} />

      <Section title="Account">
        <DetailRow label="Email" value={profile.email} />
        <DetailRow label="Status" value={humanize(profile.status)} />
        <DetailRow label="Roles" value={profile.roles.join(" · ")} />
        {program && (
          <DetailRow
            label="Program"
            value={
              <>
                {program.degreeCode} · {program.branchName}{" "}
                <span className="text-muted-foreground">({program.branchCode})</span>
              </>
            }
          />
        )}
      </Section>

      {faculty && (
        <Section title="Staff details">
          <DetailRow label="Staff ID" value={faculty.staffId} />
          <DetailRow label="Designation" value={faculty.designation} />
          <DetailRow label="Phone" value={faculty.phone} />
          <DetailRow label="Emergency phone" value={faculty.emergencyPhone} />
          <DetailRow label="Gender" value={faculty.gender ? humanize(faculty.gender) : null} />
          <DetailRow label="Date of birth" value={isoToDate(faculty.dateOfBirth)} />
          <DetailRow
            label="Marital status"
            value={faculty.maritalStatus ? humanize(faculty.maritalStatus) : null}
          />
          <DetailRow label="Father’s name" value={faculty.fatherName} />
          <DetailRow label="Mother’s name" value={faculty.motherName} />
        </Section>
      )}

      {student && (
        <Section title="Student details">
          <DetailRow label="Register number" value={student.registerNumber} />
          <DetailRow label="Roll number" value={student.rollNumber} />
          <DetailRow label="Phone" value={student.phone} />
          <DetailRow label="Gender" value={student.gender ? humanize(student.gender) : null} />
          <DetailRow label="Date of birth" value={isoToDate(student.dateOfBirth)} />
        </Section>
      )}
    </div>
  );
}
