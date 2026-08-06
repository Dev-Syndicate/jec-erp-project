// The signed-in user's own profile page: identity (name, email, roles, account
// status), their program, and the role-specific record (faculty HR fields or
// student register detail). Read-only — edits to these live with the class
// teacher / HOD / Admin tools, not here. Sign-out stays in the app shell.
"use client";

import { DetailPanel, DetailRow, DetailSection } from "@/components/detail-panel";
import { LoadingState } from "@/components/loading-state";
import { PageShell } from "@/app/(app)/page-shell";
import { PageHeader } from "@/app/(app)/page-header";
import { useProfile } from "@/features/profile/hooks/use-profile";

// Title-case a SCREAMING_ENUM value for display ("ASST_PROFESSOR" isn't used —
// these are single tokens like ACTIVE / MALE / MARRIED).
function humanize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

const isoToDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

export function ProfileView() {
  const { data: profile, isPending, isError } = useProfile();

  if (isPending) {
    return (
      <PageShell width="narrow">
        <LoadingState label="Loading your profile…" />
      </PageShell>
    );
  }

  if (isError || !profile) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Account"
          title="Your profile"
          description="We couldn’t load your profile just now."
        />
        <p className="text-sm text-muted-foreground">Refresh the page to try again.</p>
      </PageShell>
    );
  }

  const { faculty, student, program } = profile;

  // The identity line under the name: what this person IS here. Staff read as
  // their designation, students as their program — the first thing you would
  // say about either.
  const subtitle = faculty
    ? faculty.designation
    : program
      ? `${program.degreeCode} · ${program.branchCode}`
      : undefined;

  return (
    <PageShell width="narrow">
      <PageHeader
        eyebrow="Account"
        title="Your profile"
        description="Your account and contact details as they’re held in the ERP. Corrections go through your class teacher or the office."
      />

      {/* Content left, summary right — the reference layout. Collapses to one
          column below lg, where the panel leads because "who am I looking at"
          should come before the detail on a narrow screen. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
          <DetailSection title="Account">
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
          </DetailSection>

          {faculty && (
            <DetailSection title="Staff details">
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
            </DetailSection>
          )}

          {student && (
            <DetailSection title="Student details">
              <DetailRow label="Register number" value={student.registerNumber} />
              <DetailRow label="Roll number" value={student.rollNumber} />
              <DetailRow label="Phone" value={student.phone} />
              <DetailRow label="Gender" value={student.gender ? humanize(student.gender) : null} />
              <DetailRow label="Date of birth" value={isoToDate(student.dateOfBirth)} />
            </DetailSection>
          )}
        </div>

        <DetailPanel
          className="order-1 lg:order-2"
          name={profile.displayName}
          subtitle={subtitle}
          badges={profile.roles.length ? profile.roles : undefined}
          meta={[
            // The handful of facts worth having in view while reading the rest:
            // what you sign in with, and whether the account is live.
            {
              label: student ? "Register no." : "Staff ID",
              value: student?.registerNumber ?? faculty?.staffId,
            },
            { label: "Status", value: humanize(profile.status) },
          ]}
        />
      </div>
    </PageShell>
  );
}
