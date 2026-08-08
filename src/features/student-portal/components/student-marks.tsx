// Student portal — the signed-in student's own internal marks, as its own page.
// Moved off the Overview because marks are a thing you go and look up, and the
// dashboard was spending a whole section on "No marks published yet" for most of
// the semester.
//
// Data comes from the same self-scoped GET /api/me/overview the Overview uses
// (no client id), so the shared query cache serves this page without a second
// round-trip.
"use client";

import { FormError } from "@/components/form-error";
import { PageShell } from "@/app/(app)/page-shell";
import { useStudentOverview } from "@/features/student-portal/hooks/use-portal";
import type { StudentOverview, SubjectMarks } from "@/features/student-portal/types";

export function StudentMarks() {
  const { data, isLoading, isError, error } = useStudentOverview();

  if (isLoading) {
    return (
      <PageShell width="narrow">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted/60" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted/40" />
      </PageShell>
    );
  }
  if (isError) {
    return (
      <PageShell width="narrow">
        <FormError>{error instanceof Error ? error.message : "Couldn't load your marks."}</FormError>
      </PageShell>
    );
  }

  const o = data as StudentOverview;

  return (
    <PageShell width="narrow" className="gap-6">
      <header className="flex flex-col gap-1.5">
        <span className="eyebrow text-primary">
          {o.profile.classLabel ? `${o.profile.programLabel} · ${o.profile.classLabel}` : ""}
          {o.semesterLabel ? ` · ${o.semesterLabel}` : ""}
        </span>
        <h1 className="font-heading text-2xl font-semibold text-foreground md:text-3xl">
          Internal marks
        </h1>
        <p className="text-sm text-muted-foreground">
          Your assessment marks for the active semester, as published by your subject teachers.
        </p>
      </header>

      {o.notEnrolled ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          You&apos;re not enrolled in a class for the active year yet. Your marks will show here once
          you&apos;re placed.
        </p>
      ) : o.marks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          No marks published yet. They appear here as your teachers enter them.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {o.marks.map((m) => (
            <SubjectCard key={m.subjectId} subject={m} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

// One subject, with each published assessment as a chip. Deliberately NOT
// totalled: assessments carry different maximums and the college's own weighting
// decides the internal mark, so summing them here would invent a number the
// student could mistake for their official score.
function SubjectCard({ subject }: { subject: SubjectMarks }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3.5">
      <div className="flex flex-col">
        <span className="font-mono text-xs">{subject.code}</span>
        <span className="truncate text-sm text-muted-foreground">{subject.name}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {subject.items.map((it) => (
          <span
            key={it.assessment}
            className="inline-flex items-baseline gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs"
          >
            <span className="font-mono text-[0.65rem] text-muted-foreground">{it.assessment}</span>
            <span className="font-medium">
              {it.obtained}
              <span className="text-muted-foreground">/{it.maxMark}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
