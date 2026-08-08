// Student portal — the signed-in student's own internal marks.
//
// THIS PAGE IS A MARK SHEET, because that is the artifact a student already
// knows: subjects down the side, assessments across the top, one score per cell.
// The whole term fits on one screen, and the comparison a student actually makes
// — "which subject am I behind in?" — is reading down a column, not scrolling
// through six cards.
//
// The scheme underneath it: IA1 and IA2 are each a COMPOSITE out of 100 (two
// cycle tests at 10, two assignments at 10, the IAT paper at 60), stored as five
// rows so a component can be corrected on its own. The server groups them and
// sums the total on read; scheme.ts owns the labels and maximums and is the only
// place the college's marking scheme is written down.
//
// Earlier attempts are recorded so they aren't repeated. Rendering the stored
// rows flat gave ten chips per subject labelled with enum keys, where "6/10" and
// "40/60" read as equals. Replacing those with a proportionally segmented bar
// per assessment fixed the weighting but failed twice over: at real marks every
// part sits around 60% full, so five near-identical segments carried no
// information while looking like they should, and twelve stacked copies needed
// 3000px to say what this grid says in one screen. A "dropped" column was tried
// after that and cut as noise. What's left is the plainest thing that answers
// the question: the part, and what you got on it.
//
// Data comes from the same self-scoped GET /api/me/overview the Overview uses
// (no client id), so the shared query cache serves this page without a second
// round-trip.
"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { FormError } from "@/components/form-error";
import { PageShell } from "@/app/(app)/page-shell";
import { useStudentOverview } from "@/features/student-portal/hooks/use-portal";
import type {
  StudentOverview,
  SubjectAssessment,
  SubjectMarks,
} from "@/features/student-portal/types";

// The assessments a student sits, in order. A column is kept as soon as ANY
// subject has that mark — so a dash means "not marked for this subject yet",
// which is real information, while a column nobody has been marked in at all
// (typically Model, until the very end of term) is dropped rather than printed
// as a stripe of dashes down the page.
const ASSESSMENT_COLUMNS = [
  { key: "IA1", label: "Internal 1", short: "IA 1" },
  { key: "IA2", label: "Internal 2", short: "IA 2" },
  { key: "MODEL", label: "Model exam", short: "Model" },
] as const;

type Column = (typeof ASSESSMENT_COLUMNS)[number];

function columnsFor(marks: SubjectMarks[]): Column[] {
  const seen = new Set(
    marks.flatMap((m) => m.assessments.filter((a) => a.obtained !== null).map((a) => a.key)),
  );
  return ASSESSMENT_COLUMNS.filter((c) => seen.has(c.key));
}

// 50 is the pass line every assessment here is marked against. Colour is spent
// only on a mark BELOW it — a page where every number is coloured is a page
// where colour means nothing, and at real marks almost everything lands in one
// band. The one thing worth interrupting the reader for is a fail.
const PASS = 50;

function isShort(a: SubjectAssessment): boolean {
  if (a.obtained === null) return false;
  const scale = scaleOf(a);
  return scale > 0 && (a.obtained / scale) * 100 < PASS;
}

// What a score is out of RIGHT NOW. While parts are still outstanding this is
// the marked-so-far total, not 100: scoring 25 of an entered 40 is a pass, and
// showing it as "25/100" would tell a student they are failing an assessment
// that simply is not finished being marked.
function scaleOf(a: SubjectAssessment): number {
  return a.complete ? a.max : a.parts.reduce((s, p) => (p.obtained === null ? s : s + p.max), 0);
}

export function StudentMarks() {
  const { data, isLoading, isError, error } = useStudentOverview();

  if (isLoading) {
    return (
      <PageShell width="narrow">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted/60" />
        <div className="h-72 animate-pulse rounded-2xl bg-muted/40" />
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
          Every internal is out of 100: two cycle tests and two assignments worth 10 each, and the
          IAT paper worth 60. Open a subject to see where its marks came from.
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
        <MarkSheet marks={o.marks} />
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

function MarkSheet({ marks }: { marks: SubjectMarks[] }) {
  // One row open at a time. A mark sheet is for scanning; letting every row
  // expand at once rebuilds the wall of detail this layout exists to avoid.
  const [openId, setOpenId] = useState<string | null>(null);
  const columns = columnsFor(marks);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Column heads. Hidden on a narrow screen, where each row prints its own
          labels instead — a numeric grid at 390px would either truncate the
          subject name to nothing or force a sideways scroll. */}
      <div className="hidden items-end gap-3 border-b border-border px-4 py-2.5 sm:flex">
        <span className="flex-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
          Subject
        </span>
        {columns.map((c) => (
          <span
            key={c.key}
            className="w-16 text-right text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {c.short}
          </span>
        ))}
        <span className="w-4" aria-hidden />
      </div>

      <ul>
        {marks.map((subject) => (
          <SubjectRow
            key={subject.subjectId}
            subject={subject}
            columns={columns}
            open={openId === subject.subjectId}
            onToggle={() =>
              setOpenId((cur) => (cur === subject.subjectId ? null : subject.subjectId))
            }
          />
        ))}
      </ul>
    </div>
  );
}

function SubjectRow({
  subject,
  columns,
  open,
  onToggle,
}: {
  subject: SubjectMarks;
  columns: Column[];
  open: boolean;
  onToggle: () => void;
}) {
  const byKey = new Map(subject.assessments.map((a) => [a.key, a]));

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:-outline-offset-2"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-[0.7rem] text-muted-foreground">{subject.code}</span>
          <span className="truncate text-sm font-medium text-foreground">{subject.name}</span>
        </span>

        {/* Wide: aligned numeric columns, so a term reads down the page. */}
        <span className="hidden sm:contents">
          {columns.map((c) => (
            <span key={c.key} className="w-16 text-right">
              <Score assessment={byKey.get(c.key)} />
            </span>
          ))}
        </span>

        {/* Narrow: the same scores, labelled, beside the name. */}
        <span className="flex shrink-0 gap-3 sm:hidden">
          {columns.filter((c) => byKey.has(c.key)).map((c) => (
            <span key={c.key} className="flex flex-col items-end">
              <span className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                {c.short}
              </span>
              <Score assessment={byKey.get(c.key)} />
            </span>
          ))}
        </span>

        <ChevronRight
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden
        />
      </button>

      {open && (
        // Side by side once there's room: the two internals are the same five
        // parts, so setting them in a pair makes "did I improve?" a matter of
        // reading across. Stacked below sm, where columns would crush.
        <div className="grid gap-x-8 gap-y-5 border-t border-border bg-muted/20 px-4 py-4 sm:grid-cols-2">
          {subject.assessments.map((a) => (
            <Breakdown key={a.key} assessment={a} />
          ))}
        </div>
      )}
    </li>
  );
}

// One cell. A dash is not "zero" — it is an assessment that hasn't been marked,
// and it must read as absence rather than as a bad score.
function Score({ assessment }: { assessment: SubjectAssessment | undefined }) {
  if (!assessment || assessment.obtained === null) {
    return <span className="font-mono text-sm text-muted-foreground/40">—</span>;
  }
  const scale = scaleOf(assessment);
  const short = isShort(assessment);

  return (
    <span className="font-mono text-sm tabular-nums">
      <span className={short ? "font-semibold text-destructive" : "font-medium text-foreground"}>
        {assessment.obtained}
      </span>
      {/* The denominator only earns its space when it ISN'T 100 — that is
          precisely the case where the number means something other than it
          appears (an assessment still being marked). */}
      {scale !== assessment.max && (
        <span className="text-muted-foreground">/{scale}</span>
      )}
    </span>
  );
}

// The expanded view: where one score came from. Two columns — the part, and what
// was scored on it out of what it was worth.
//
// No bars here, deliberately. A component bar was tried twice and failed the
// same way both times: at real marks every part sits around 60% full, so five
// segments of near-identical fill carry no information while looking like they
// should, and the figures underneath then say the whole thing again in words.
// Small aligned numbers beat pictures of small numbers — the same lesson as the
// outer layout.
function Breakdown({ assessment }: { assessment: SubjectAssessment }) {
  const label = ASSESSMENT_COLUMNS.find((c) => c.key === assessment.key)?.label ?? assessment.key;
  const scale = scaleOf(assessment);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
        <span className="text-xs font-medium text-foreground">
          {label}
          {!assessment.complete && (
            <span className="ml-2 font-normal text-muted-foreground">still being marked</span>
          )}
        </span>
        <span className="font-mono text-xs tabular-nums">
          <span
            className={
              isShort(assessment) ? "font-semibold text-destructive" : "font-medium text-foreground"
            }
          >
            {assessment.obtained}
          </span>
          <span className="text-muted-foreground">/{scale}</span>
        </span>
      </div>

      <table className="w-full text-[0.7rem]">
        <tbody>
          {assessment.parts.map((p) => (
            <tr key={p.key}>
              <td className="py-0.5 text-muted-foreground">{p.label}</td>
              <td className="whitespace-nowrap py-0.5 pl-4 text-right font-mono tabular-nums">
                {p.obtained === null ? (
                  // The scale alone, greyed, plus the reason. "—/60" reads as a
                  // mark of minus something; this reads as a paper still to come.
                  <span className="text-muted-foreground/60">not marked</span>
                ) : (
                  <>
                    <span className="font-medium text-foreground">{p.obtained}</span>
                    <span className="text-muted-foreground">/{p.max}</span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
