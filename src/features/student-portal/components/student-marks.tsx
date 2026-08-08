// Student portal — the signed-in student's own internal marks.
//
// THE SHAPE OF THIS PAGE IS THE COLLEGE'S MARKING SCHEME, not a list of rows.
// IA1 and IA2 are each a composite out of 100 — two cycle tests (10 each), two
// assignments (10 each) and the IAT exam (60). The previous version rendered the
// stored rows flat: ten chips per subject labelled with raw enum keys, where
// "6/10" and "40/60" sat at identical weight and nothing revealed that the parts
// summed to 100. A student could not answer "how did I do in IA1?" without
// reading and adding ten chips.
//
// So each assessment is one row scored out of 100, and its components are drawn
// as a single track segmented in TRUE PROPORTION: the IAT exam is 60% of the bar
// because it is 60% of the mark. Where you lost marks is then a matter of
// looking, not arithmetic — a short segment in the wide block costs far more
// than a short segment in a narrow one, and the bar shows that directly.
//
// Data comes from the same self-scoped GET /api/me/overview the Overview uses
// (no client id), so the shared query cache serves this page without a second
// round-trip. The scheme itself (labels, maximums, grouping) is resolved
// server-side from scheme.ts — never re-declared here.
"use client";

import { FormError } from "@/components/form-error";
import { PageShell } from "@/app/(app)/page-shell";
import { useStudentOverview } from "@/features/student-portal/hooks/use-portal";
import type {
  StudentOverview,
  SubjectAssessment,
  SubjectMarks,
} from "@/features/student-portal/types";

// The assessment keys the server sends, in the order a student sits them.
const ASSESSMENT_LABEL: Record<string, string> = {
  IA1: "Internal 1",
  IA2: "Internal 2",
  MODEL: "Model exam",
};

// Bands for a mark out of 100, used ONLY on the total. 50 is the pass line every
// assessment here is marked against. These use the FIXED --status-* tokens
// rather than the brand ramp, matching how attendance already encodes meaning:
// the colour is the message, so it must not move when --brand-hue does.
//
// The segments themselves are deliberately NOT banded. Colouring all five by
// their own percentage turned every card into a block of amber — real marks
// cluster in one band, so a per-part band is noise that looks like signal. One
// coloured number per assessment is the whole colour budget of this page.
function toneOf(pct: number): string {
  if (pct >= 75) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-destructive";
}

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
          Each internal is scored out of 100: two cycle tests and two assignments worth 10 each,
          and the IAT paper worth 60.
        </p>
      </header>

      {o.notEnrolled ? (
        <EmptyState>
          You&apos;re not enrolled in a class for the active year yet. Your marks appear here once
          you&apos;re placed.
        </EmptyState>
      ) : o.marks.length === 0 ? (
        <EmptyState>
          No marks published yet. They appear here as your teachers enter them.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {o.marks.map((m) => (
            <SubjectCard key={m.subjectId} subject={m} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function SubjectCard({ subject }: { subject: SubjectMarks }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex flex-col">
        <span className="font-mono text-xs text-primary">{subject.code}</span>
        <h2 className="font-heading text-sm font-semibold text-foreground">{subject.name}</h2>
      </div>

      <div className="flex flex-col gap-4">
        {subject.assessments.map((a) => (
          <AssessmentRow key={a.key} assessment={a} />
        ))}
      </div>
    </section>
  );
}

function AssessmentRow({ assessment }: { assessment: SubjectAssessment }) {
  const obtained = assessment.obtained ?? 0;
  // Marked-so-far, not the full 100, while parts are outstanding. Scoring 25 of
  // an entered 40 is a pass; showing it as "25/100" in red would tell a student
  // they are failing an assessment that isn't finished being marked. The total
  // only becomes /100 once every part is in.
  const scale = assessment.complete
    ? assessment.max
    : assessment.parts.reduce((s, p) => (p.obtained === null ? s : s + p.max), 0);
  const tone = toneOf(scale > 0 ? (obtained / scale) * 100 : 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-foreground">
          {ASSESSMENT_LABEL[assessment.key] ?? assessment.key}
          {!assessment.complete && (
            <span className="ml-2 font-normal text-muted-foreground">still being marked</span>
          )}
        </span>
        <span className="font-mono text-sm">
          <span className={`font-semibold ${tone}`}>{obtained}</span>
          <span className="text-muted-foreground">/{scale}</span>
        </span>
      </div>

      <ComponentBar assessment={assessment} />
    </div>
  );
}

// The signature element. One track per assessment, its segments sized by each
// component's share of the 100 — so the IAT block is six times the width of a
// cycle test, exactly as it is six times the marks.
//
// Read it as ink and gap: solid is what you scored, hollow is what you dropped.
// Because the widths are true to the weighting, the GAP is drawn to scale as
// well — dropping 20 on the IAT leaves a hole six times wider than dropping the
// whole of a cycle test. That is the thing a flat list of chips could never
// show, and it is why the bar is worth its space.
function ComponentBar({ assessment }: { assessment: SubjectAssessment }) {
  return (
    <>
      {/* Decorative: the definition list below is the same data as text, so
          announcing every segment would just read the marks out twice. */}
      <div className="flex h-6 gap-0.5" aria-hidden>
        {assessment.parts.map((p) => {
          const share = (p.max / assessment.max) * 100;
          const unmarked = p.obtained === null;
          const filled = unmarked ? 0 : (p.obtained! / p.max) * 100;

          return (
            <div
              key={p.key}
              className={`relative min-w-0 overflow-hidden rounded-[3px] ${
                // A part with no mark yet is a dashed outline, not an empty
                // trough — "not marked" must not look like "scored nothing".
                unmarked ? "border border-dashed border-border" : "bg-muted"
              }`}
              style={{ flexBasis: `${share}%` }}
            >
              <div
                className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${filled}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Exact figures, in the college's own words. The answer to "which part
          cost me marks", and the accessible reading of the bar above. */}
      <dl className="flex flex-wrap gap-x-4 gap-y-1">
        {assessment.parts.map((p) => (
          <div key={p.key} className="flex items-baseline gap-1.5">
            <dt className="text-[0.7rem] text-muted-foreground">{p.label}</dt>
            <dd className="font-mono text-[0.7rem]">
              {p.obtained === null ? (
                <span className="text-muted-foreground/60">not marked</span>
              ) : (
                <>
                  <span className="font-medium">{p.obtained}</span>
                  <span className="text-muted-foreground">/{p.max}</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
