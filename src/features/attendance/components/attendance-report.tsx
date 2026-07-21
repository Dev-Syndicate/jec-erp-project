// Attendance report — the percentages the two-table design exists to produce.
// Pick Program → Class; see each student's overall % (from MasterAttendance) for
// the active semester, flag defaulters under a threshold, and expand a row for
// the per-subject breakdown (from PeriodAttendance). Super-Admin only.
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Input } from "@/components/ui/input";
import { PageHeader } from "@/app/(app)/page-header";
import { FormSelect } from "@/features/attendance/components/form-select";
import type { AttendanceReport, StudentReport, SubjectMeta } from "@/features/attendance/types";
import { useAttendanceReport, useClassOptions } from "@/features/attendance/hooks/use-attendance";

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

// Fixed (non-brand) tone for a percentage vs the threshold — attendance % encodes
// meaning. Null (nothing marked) reads muted.
function pctTone(pct: number | null, threshold: number): string {
  if (pct === null) return "text-muted-foreground";
  return pct < threshold ? "text-red-600" : "text-emerald-600";
}
const fmtPct = (pct: number | null) => (pct === null ? "—" : `${pct}%`);

export function AttendanceReport() {
  const classes = useClassOptions();
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");
  const [threshold, setThreshold] = useState(75);

  const activeClasses = (classes.data ?? []).filter((c) => c.isActive);
  const programOptions = [
    ...new Map(activeClasses.map((c) => [c.programId, c.programLabel])).entries(),
  ].map(([id, label]) => ({ value: id, label }));
  const classesInProgram = activeClasses.filter((c) => c.programId === programId);

  const report = useAttendanceReport(classId || null);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Attendance · Report"
        title="Attendance report"
        description="Overall and per-subject attendance for a class in the active semester. Present and OD count as attended."
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Program</span>
          <div className="w-56">
            <FormSelect
              value={programId}
              onChange={(v) => {
                setProgramId(v);
                setClassId("");
              }}
              options={programOptions}
              placeholder={classes.isPending ? "Loading…" : "Select a program"}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Class</span>
          <div className="w-40">
            <FormSelect
              value={classId}
              onChange={setClassId}
              options={classesInProgram.map((c) => ({ value: c.id, label: c.shortLabel }))}
              placeholder={
                programId === ""
                  ? "Pick a program first"
                  : classesInProgram.length === 0
                    ? "No classes"
                    : "Select a class"
              }
              disabled={programId === ""}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Defaulter below</span>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="h-10! w-20"
              aria-label="Defaulter threshold percent"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
      </div>

      {classId === "" ? (
        <p className="text-sm text-muted-foreground">Pick a program, then a class, to see its attendance.</p>
      ) : report.isPending ? (
        <p className="text-sm text-muted-foreground">Loading report…</p>
      ) : report.isError ? (
        <FormError>{errorMessage(report.error)}</FormError>
      ) : report.data ? (
        <Loaded report={report.data} threshold={threshold} />
      ) : null}
    </div>
  );
}

function Loaded({ report, threshold }: { report: AttendanceReport; threshold: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const withData = report.students.filter((s) => s.overall.total > 0);
  const avg =
    withData.length > 0
      ? Math.round(withData.reduce((sum, s) => sum + (s.overall.pct ?? 0), 0) / withData.length)
      : null;
  const defaulters = withData.filter((s) => (s.overall.pct ?? 0) < threshold).length;
  const noData = withData.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-foreground">{report.classLabel}</span>
        <span className="text-muted-foreground">· {report.semesterLabel}</span>
      </div>

      {noData ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
          No attendance has been marked for this class in the active semester yet.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-md bg-muted px-2.5 py-1 font-medium text-muted-foreground">
            Class average <span className="text-foreground">{fmtPct(avg)}</span>
          </span>
          <span className="rounded-md bg-red-500/10 px-2.5 py-1 font-medium text-red-600">
            {defaulters} below {threshold}%
          </span>
          <span className="rounded-md bg-muted px-2.5 py-1 font-medium text-muted-foreground">
            {report.students.length} students · {report.subjectsMeta.length} subjects
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-140 border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 font-medium">Register no.</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 text-right font-medium">Attended</th>
              <th className="px-3 py-2 text-right font-medium">Overall</th>
            </tr>
          </thead>
          <tbody>
            {report.students.map((s) => (
              <StudentRow
                key={s.studentId}
                student={s}
                subjectsMeta={report.subjectsMeta}
                threshold={threshold}
                open={expanded.has(s.studentId)}
                onToggle={() => toggle(s.studentId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentRow({
  student,
  subjectsMeta,
  threshold,
  open,
  onToggle,
}: {
  student: StudentReport;
  subjectsMeta: SubjectMeta[];
  threshold: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { overall } = student;
  const metaById = new Map(subjectsMeta.map((m) => [m.subjectId, m]));

  return (
    <>
      <tr className="border-b border-foreground/10 last:border-b-0">
        <td className="px-2 py-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={open ? "Hide subjects" : "Show subjects"}
            className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted"
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </td>
        <td className="px-3 py-2 font-mono text-xs">{student.registerNumber}</td>
        <td className="px-3 py-2">{student.displayName}</td>
        <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
          {overall.attended}/{overall.total}
        </td>
        <td className={`px-3 py-2 text-right font-medium ${pctTone(overall.pct, threshold)}`}>
          {fmtPct(overall.pct)}
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/20">
          <td />
          <td colSpan={4} className="px-3 py-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1.5">
              {student.subjects.map((st) => {
                const meta = metaById.get(st.subjectId);
                return (
                  <span key={st.subjectId} className="flex items-center gap-1.5 text-xs">
                    <span className="font-mono text-muted-foreground">{meta?.code}</span>
                    <span className={`font-medium ${pctTone(st.pct, threshold)}`}>{fmtPct(st.pct)}</span>
                    <span className="text-muted-foreground">
                      ({st.attended}/{st.total})
                    </span>
                  </span>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
