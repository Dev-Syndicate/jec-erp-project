// Internal marks entry — the faculty's per-assessment grid. Pick an assigned
// (class + subject), choose an assessment (IA1/IA2/Model/Assignment), enter each
// student's mark against a shared max, and save. Marks admins (HOD/SA) see every
// assignment in their program; a plain faculty sees only their own. The API
// re-checks the (subject, class, semester) assignment on read AND save.
"use client";

import { useMemo, useState } from "react";
import { Lock, Save, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";
import { FormError } from "@/components/form-error";
import { PageHeader } from "@/app/(app)/page-header";
import { FormSelect } from "@/components/form-select";
import {
  ASSESSMENTS,
  type Assessment,
  type MarkAssignment,
  type MarkComponent,
  type MarkRow,
  type MarksSheet,
  type SaveMarksInput,
} from "@/features/marks/types";
import {
  useMarkAssignments,
  useMarksSheet,
  useSaveMarks,
} from "@/features/marks/hooks/use-marks";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

/**
 * Year → Section → Subject drill-down over the caller's markable assignments.
 *
 * A plain faculty member has a handful; a HOD sees every (class × subject) in the
 * department, which is 20+ entries — far too many for one flat list. Three short
 * selects narrow it in the order people actually think: which year, which
 * section, which subject.
 *
 * Levels with only one choice auto-select and hide themselves, so a faculty
 * teaching one class still lands on their subject in a single click. Mirrors the
 * ClassCascade pattern used by the student dialogs.
 */
function AssignmentPicker({
  options,
  value,
  onChange,
}: {
  options: MarkAssignment[];
  value: string; // "classId::subjectId"
  onChange: (key: string) => void;
}) {
  const selected = options.find((a) => `${a.classId}::${a.subjectId}` === value);
  const [year, setYear] = useState<string>(selected ? String(selected.year) : "");
  const [section, setSection] = useState<string>(selected?.section ?? "");

  const years = [...new Set(options.map((a) => a.year))].sort((a, b) => a - b);
  const effYear = years.length === 1 ? String(years[0]) : year;

  const inYear = options.filter((a) => String(a.year) === effYear);
  const sections = [...new Set(inYear.map((a) => a.section))].sort((a, b) => a.localeCompare(b));
  const effSection = sections.length === 1 ? sections[0] : section;

  const subjects = inYear
    .filter((a) => a.section === effSection)
    .sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));

  // Changing a level clears everything downstream — a stale subject from another
  // section must never stay selected.
  const pickYear = (v: string) => {
    setYear(v);
    setSection("");
    onChange("");
  };
  const pickSection = (v: string) => {
    setSection(v);
    onChange("");
  };

  return (
    <>
      {/* All three render ALWAYS, disabled until reachable. Revealing them one by
          one made the row grow as you selected, shoving Assessment sideways on
          every click; a fixed row just fills in left to right. */}
      <Field label="Year">
        <div className="w-32">
          <FormSelect
            value={effYear}
            onChange={pickYear}
            options={years.map((y) => ({ value: String(y), label: `Year ${roman(y)}` }))}
            placeholder="Year"
            disabled={years.length <= 1}
          />
        </div>
      </Field>
      <Field label="Section">
        <div className="w-36">
          <FormSelect
            value={effSection}
            onChange={pickSection}
            options={sections.map((s) => ({ value: s, label: `Section ${s}` }))}
            placeholder={effYear === "" ? "—" : "Section"}
            disabled={effYear === "" || sections.length <= 1}
          />
        </div>
      </Field>
      <Field label="Subject">
        <div className="w-72">
          <FormSelect
            value={value}
            onChange={onChange}
            options={subjects.map((a) => ({
              value: `${a.classId}::${a.subjectId}`,
              // Flag the ones a HOD can only read, before they open the sheet.
              label: `${a.subjectCode} — ${a.subjectName}${a.canEnter ? "" : " (view only)"}`,
            }))}
            placeholder={effSection === "" ? "—" : "Select a subject"}
            disabled={effSection === ""}
          />
        </div>
      </Field>
    </>
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
        description="Enter internal assessment marks for the subjects you teach this semester. Marks are recorded by the subject's own teacher."
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
              <AssignmentPicker
                options={options}
                value={assignmentKey}
                onChange={setAssignmentKey}
              />
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
  // "studentId::componentKey" → the raw input string ("" = blank = no mark).
  const cellKey = (studentId: string, component: string) => `${studentId}::${component}`;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const s of sheet.students) {
      for (const c of sheet.components) {
        const v = s.marks[c.key];
        init[cellKey(s.studentId, c.key)] = v === null || v === undefined ? "" : String(v);
      }
    }
    return init;
  });
  const [ok, setOk] = useState(false);

  // No re-sync effect needed: the parent remounts this grid via `key` whenever the
  // class/subject/assessment changes, so state is (re)initialised from fresh props
  // each time. After a save, the values the user typed already equal the server's,
  // so there's nothing to pull back in.

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

  // Per-cell validity: blank is fine; a filled cell must be 0..that column's max.
  // Each column has its own maximum (10 for a test/assignment, 60 for the IAT).
  function cellError(raw: string, max: number): boolean {
    if (raw.trim() === "") return false;
    const n = Number(raw);
    return !Number.isFinite(n) || n < 0 || n > max;
  }
  const anyError = sheet.students.some((s) =>
    sheet.components.some((c) => cellError(values[cellKey(s.studentId, c.key)] ?? "", c.max)),
  );

  /** A student's running total across the components entered so far. */
  function rowTotal(studentId: string): number | null {
    let sum = 0;
    let any = false;
    for (const c of sheet.components) {
      const raw = (values[cellKey(studentId, c.key)] ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      sum += n;
      any = true;
    }
    return any ? sum : null;
  }

  // "Complete" = every component filled, since a partial IAT isn't a result yet.
  const completeCount = sheet.students.filter((s) =>
    sheet.components.every((c) => (values[cellKey(s.studentId, c.key)] ?? "").trim() !== ""),
  ).length;

  function submit() {
    if (anyError) return;
    const marks: SaveMarksInput["marks"] = [];
    for (const s of sheet.students) {
      for (const c of sheet.components) {
        const raw = (values[cellKey(s.studentId, c.key)] ?? "").trim();
        if (raw === "") continue; // blank stays unstored, never a 0
        marks.push({ studentId: s.studentId, component: c.key, obtained: Number(raw) });
      }
    }
    save.mutate(
      { classId: sheet.classId, subjectId: sheet.subjectId, assessment: sheet.assessment, marks },
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
          {completeCount}/{sheet.students.length} complete
        </p>
        <div className="flex items-end gap-3">
          {/* No editable "Out of": each column's maximum is fixed by the college
              scheme (10/10/10/10/60, total 100) and comes from the server. */}
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              size="lg"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search students"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-200 border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
              <th className="w-10 px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Register no.</th>
              <th className="px-3 py-2 font-medium">Name</th>
              {sheet.components.map((c) => (
                <th key={c.key} className="w-28 px-2 py-2 text-right font-medium">
                  <span className="block leading-tight">{c.label}</span>
                  <span className="block font-mono text-[0.65rem] font-normal">/{c.max}</span>
                </th>
              ))}
              {/* Only worth a Total column when the assessment has parts to add. */}
              {sheet.components.length > 1 && (
                <th className="w-24 px-3 py-2 text-right font-medium">
                  <span className="block leading-tight">Total</span>
                  <span className="block font-mono text-[0.65rem] font-normal">/{sheet.total}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <MarkCell
                key={s.studentId}
                index={i + 1}
                student={s}
                components={sheet.components}
                values={values}
                cellKey={cellKey}
                cellError={cellError}
                total={rowTotal(s.studentId)}
                showTotal={sheet.components.length > 1}
                onChange={(component, v) =>
                  setValues((prev) => ({ ...prev, [cellKey(s.studentId, component)]: v }))
                }
                readOnly={!sheet.canEnter}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={3 + sheet.components.length + (sheet.components.length > 1 ? 1 : 0)}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  No students match the search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {save.isError && <FormError>{errorMessage(save.error)}</FormError>}

      {sheet.canEnter ? (
        <div className="flex items-center justify-end gap-3">
          {ok && <span className="text-sm text-primary">Saved.</span>}
          <Button data-icon="inline-start" onClick={submit} disabled={anyError || save.isPending}>
            <Save />
            {save.isPending ? "Saving…" : "Save marks"}
          </Button>
        </div>
      ) : (
        // A HOD/SA overseeing results for a subject they don't teach. Marks are
        // the assessing teacher's to record (markedById names them), so this is
        // read-only rather than a save that would 403.
        <p className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Lock className="size-3.5" />
          View only — marks are entered by the teacher who takes this subject.
        </p>
      )}
    </div>
  );
}

// One student's row: an input per component, then their running total. The total
// is derived from what's typed (not stored), so it updates as marks are entered
// and can never disagree with its parts.
function MarkCell({
  index,
  student,
  components,
  values,
  cellKey,
  cellError,
  total,
  showTotal,
  onChange,
  readOnly,
}: {
  index: number;
  student: MarkRow;
  components: MarkComponent[];
  values: Record<string, string>;
  cellKey: (studentId: string, component: string) => string;
  cellError: (raw: string, max: number) => boolean;
  total: number | null;
  showTotal: boolean;
  onChange: (component: string, v: string) => void;
  readOnly: boolean;
}) {
  const complete = components.every(
    (c) => (values[cellKey(student.studentId, c.key)] ?? "").trim() !== "",
  );
  return (
    <tr className="border-b border-foreground/10 last:border-b-0">
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{index}</td>
      <td className="px-3 py-2 font-mono text-xs">{student.registerNumber}</td>
      <td className="px-3 py-2">{student.displayName}</td>
      {components.map((c) => {
        const raw = values[cellKey(student.studentId, c.key)] ?? "";
        return (
          <td key={c.key} className="px-2 py-2">
            <div className="flex justify-end">
              <Input
                type="number"
                min={0}
                max={c.max}
                inputMode="numeric"
                value={raw}
                onChange={(e) => onChange(c.key, e.target.value)}
                aria-invalid={cellError(raw, c.max)}
                aria-label={`${c.label} for ${student.displayName}, out of ${c.max}`}
                placeholder="—"
                className="h-9! w-20 text-right"
                disabled={readOnly}
              />
            </div>
          </td>
        );
      })}
      {showTotal && (
        <td className="px-3 py-2 text-right">
          {/* Muted until every part is in — a partial sum isn't a result yet. */}
          <span
            className={`font-mono text-sm ${complete ? "font-medium text-foreground" : "text-muted-foreground"}`}
          >
            {total ?? "—"}
          </span>
        </td>
      )}
    </tr>
  );
}
