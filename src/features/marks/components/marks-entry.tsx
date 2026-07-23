// Internal marks entry — the faculty's per-assessment grid. Pick an assigned
// (class + subject), choose an assessment (IA1/IA2/Model/Assignment), enter each
// student's mark against a shared max, and save. Marks admins (HOD/SA) see every
// assignment in their program; a plain faculty sees only their own. The API
// re-checks the (subject, class, semester) assignment on read AND save.
"use client";

import { useMemo, useState } from "react";
import { Save, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/app/(app)/page-header";
import { FormSelect } from "@/features/marks/components/form-select";
import { ASSESSMENTS, type Assessment, type MarkRow, type MarksSheet } from "@/features/marks/types";
import {
  useMarkAssignments,
  useMarksSheet,
  useSaveMarks,
} from "@/features/marks/hooks/use-marks";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}

function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      {children}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function MarksEntry() {
  const assignments = useMarkAssignments();
  const [assignmentKey, setAssignmentKey] = useState(""); // "classId::subjectId"
  const [assessment, setAssessment] = useState<Assessment>("IA1");

  const options = assignments.data?.assignments ?? [];
  // One assignment → auto-select it; else the user picks.
  const single = options.length === 1;
  const effKey = single ? `${options[0].classId}::${options[0].subjectId}` : assignmentKey;
  const [classId, subjectId] = effKey ? effKey.split("::") : [null, null];

  const sheet = useMarksSheet(classId, subjectId, assessment, !!classId && !!subjectId);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Academic · Internal marks"
        title="Internal marks"
        description="Enter internal assessment marks for the subjects you teach this semester."
      />

      {assignments.isPending ? (
        <p className="text-sm text-muted-foreground">Loading your subjects…</p>
      ) : assignments.isError ? (
        <FormError>{errorMessage(assignments.error)}</FormError>
      ) : !assignments.data?.semester ? (
        <p className="text-sm text-muted-foreground">
          No semester is active. Activate one before entering marks.
        </p>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You&apos;re not assigned to any subject this semester.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            {!single && (
              <Field label="Class & subject">
                <div className="w-80">
                  <FormSelect
                    value={assignmentKey}
                    onChange={setAssignmentKey}
                    options={options.map((a) => ({
                      value: `${a.classId}::${a.subjectId}`,
                      label: `${a.classLabel} — ${a.subjectCode}`,
                    }))}
                    placeholder="Select a subject"
                  />
                </div>
              </Field>
            )}
            <Field label="Assessment">
              <div className="w-44">
                <FormSelect
                  value={assessment}
                  onChange={(v) => setAssessment(v as Assessment)}
                  options={ASSESSMENTS}
                  placeholder="Assessment"
                />
              </div>
            </Field>
          </div>

          {!effKey ? (
            <p className="text-sm text-muted-foreground">Pick a subject to enter marks.</p>
          ) : sheet.isPending ? (
            <p className="text-sm text-muted-foreground">Loading students…</p>
          ) : sheet.isError ? (
            <FormError>{errorMessage(sheet.error)}</FormError>
          ) : sheet.data ? (
            <MarkGrid key={`${effKey}::${assessment}`} sheet={sheet.data} />
          ) : null}
        </>
      )}
    </div>
  );
}

function MarkGrid({ sheet }: { sheet: MarksSheet }) {
  const save = useSaveMarks();
  const [query, setQuery] = useState("");
  const [maxMark, setMaxMark] = useState(String(sheet.maxMark));
  // studentId → the raw input string ("" = blank cell = no mark).
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(sheet.students.map((s) => [s.studentId, s.obtained === null ? "" : String(s.obtained)])),
  );
  const [ok, setOk] = useState(false);

  // No re-sync effect needed: the parent remounts this grid via `key` whenever the
  // class/subject/assessment changes, so state is (re)initialised from fresh props
  // each time. After a save, the values the user typed already equal the server's,
  // so there's nothing to pull back in.

  const max = Number(maxMark);
  const maxValid = Number.isFinite(max) && max > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sheet.students;
    return sheet.students.filter(
      (s) =>
        s.registerNumber.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q) ||
        (s.rollNumber ?? "").toLowerCase().includes(q),
    );
  }, [sheet.students, query]);

  // Per-cell validity: blank is fine; a filled cell must be 0..max.
  function cellError(raw: string): boolean {
    if (raw.trim() === "") return false;
    const n = Number(raw);
    return !Number.isFinite(n) || n < 0 || (maxValid && n > max);
  }
  const anyError = !maxValid || sheet.students.some((s) => cellError(values[s.studentId] ?? ""));
  const enteredCount = sheet.students.filter((s) => (values[s.studentId] ?? "").trim() !== "").length;

  function submit() {
    if (anyError) return;
    const marks = sheet.students
      .map((s) => ({ studentId: s.studentId, raw: (values[s.studentId] ?? "").trim() }))
      .filter((m) => m.raw !== "")
      .map((m) => ({ studentId: m.studentId, obtained: Number(m.raw) }));
    save.mutate(
      { classId: sheet.classId, subjectId: sheet.subjectId, assessment: sheet.assessment, maxMark: max, marks },
      {
        onSuccess: () => {
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{sheet.classLabel}</span>
          {" · "}
          {sheet.subjectLabel}
          {" · "}
          {sheet.academicYear}
          {" · "}
          {enteredCount}/{sheet.students.length} entered
        </p>
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="max-mark" className="text-xs font-medium text-muted-foreground">
              Out of
            </Label>
            <Input
              id="max-mark"
              type="number"
              min={1}
              value={maxMark}
              onChange={(e) => setMaxMark(e.target.value)}
              className="h-10! w-24"
              aria-invalid={!maxValid}
            />
          </div>
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search students"
              className="h-10! pl-9"
            />
          </div>
        </div>
      </div>

      {!maxValid && <FormError>Out-of mark must be a positive number.</FormError>}

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-160 border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
              <th className="w-10 px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Register no.</th>
              <th className="px-3 py-2 font-medium">Roll no.</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="w-40 px-3 py-2 text-right font-medium">Mark (/{maxValid ? max : "—"})</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <MarkCell
                key={s.studentId}
                index={i + 1}
                student={s}
                value={values[s.studentId] ?? ""}
                invalid={cellError(values[s.studentId] ?? "")}
                onChange={(v) => setValues((prev) => ({ ...prev, [s.studentId]: v }))}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No students match the search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {save.isError && <FormError>{errorMessage(save.error)}</FormError>}

      <div className="flex items-center justify-end gap-3">
        {ok && <span className="text-sm text-primary">Saved.</span>}
        <Button data-icon="inline-start" onClick={submit} disabled={anyError || save.isPending}>
          <Save />
          {save.isPending ? "Saving…" : "Save marks"}
        </Button>
      </div>
    </div>
  );
}

function MarkCell({
  index,
  student,
  value,
  invalid,
  onChange,
}: {
  index: number;
  student: MarkRow;
  value: string;
  invalid: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <tr className="border-b border-foreground/10 last:border-b-0">
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{index}</td>
      <td className="px-3 py-2 font-mono text-xs">{student.registerNumber}</td>
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{student.rollNumber ?? "—"}</td>
      <td className="px-3 py-2">{student.displayName}</td>
      <td className="px-3 py-2">
        <div className="flex justify-end">
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={invalid}
            aria-label={`Mark for ${student.displayName}`}
            placeholder="—"
            className="h-9! w-24 text-right"
          />
        </div>
      </td>
    </tr>
  );
}
