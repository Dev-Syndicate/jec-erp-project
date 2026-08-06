// Attendance report — the percentages the two-table design exists to produce.
// Pick Program → Class; see each student's overall % (from MasterAttendance) for
// the active semester, flag defaulters under a threshold, and expand a row for
// the per-subject breakdown (from PeriodAttendance).
//
// The class pickers only appear when the user can reach more than one class
// (HOD/Super Admin, or a subject teacher spanning several classes). A class
// teacher who advises exactly one class skips straight to that class's report —
// no dropdown to choose the only option (same pattern as the My-class roster).
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ClipboardList } from "lucide-react";
import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from "recharts";

import { Input } from "@/components/ui/input";
import { AXIS_PROPS, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard, StatCardGrid } from "@/components/ui/stat-card";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { LoadingState } from "@/components/loading-state";
import { FormError } from "@/components/form-error";
import { PageHeader } from "@/app/(app)/page-header";
import { PageShell, TABLE_FRAME } from "@/app/(app)/page-shell";
import { FormSelect } from "@/components/form-select";
import type { AttendanceReport, StudentReport, SubjectMeta } from "@/features/attendance/types";
import { useAttendanceReport, useClassOptions } from "@/features/attendance/hooks/use-attendance";

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

  // Auto-select and hide a single-option picker: a program-scoped user (HOD) has
  // just one program, and a class teacher usually one class — so each skips
  // straight to it. Multiple options keep the relevant dropdown (same pattern as
  // Mark / Day attendance).
  const programOptions = [
    ...new Map(activeClasses.map((c) => [c.programId, c.programLabel])).entries(),
  ].map(([id, label]) => ({ value: id, label }));
  const singleProgram = programOptions.length === 1;
  const effProgramId = singleProgram ? programOptions[0].value : programId;

  const classesInProgram = activeClasses.filter((c) => c.programId === effProgramId);
  const singleClass = classesInProgram.length === 1;
  const effClassId = singleClass ? classesInProgram[0].id : classId;

  const report = useAttendanceReport(effClassId || null);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Attendance · Report"
        title="Attendance report"
        description="Overall and per-subject attendance for a class in the active semester. Present and OD count as attended."
      />

      <div className="flex flex-wrap items-end gap-4">
        {!singleProgram && (
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
        )}
        {!singleClass && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Class</span>
            <div className="w-40">
              <FormSelect
                value={classId}
                onChange={setClassId}
                options={classesInProgram.map((c) => ({ value: c.id, label: c.shortLabel }))}
                placeholder={
                  effProgramId === ""
                    ? "Pick a program first"
                    : classesInProgram.length === 0
                      ? "No classes"
                      : "Select a class"
                }
                disabled={effProgramId === ""}
              />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Defaulter below</span>
          <div className="flex items-center gap-1.5">
            <Input
              size="lg"
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="w-20"
              aria-label="Defaulter threshold percent"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
      </div>

      {/* Six outcomes, and they are NOT all "loading". Two of them ask the user
          for input ("pick a class"), which is why none of this is a skeleton:
          a skeleton would promise content that will never arrive on its own. */}
      {classes.isPending ? (
        <LoadingState label="Loading…" />
      ) : activeClasses.length === 0 ? (
        <EmptyState
          size="sm"
          title="You don’t have any classes to report on."
        />
      ) : effClassId === "" ? (
        <EmptyState
          icon={ClipboardList}
          title={singleProgram ? "Pick a class" : "Pick a program, then a class"}
          description="Choose above to see overall and per-subject attendance for the active semester."
        />
      ) : report.isPending ? (
        <LoadingState label="Loading report…" />
      ) : report.isError ? (
        <FormError>{errorMessage(report.error)}</FormError>
      ) : report.data ? (
        <Loaded report={report.data} threshold={threshold} />
      ) : null}
    </PageShell>
  );
}

// How the class is SPREAD, which the average alone hides: 78% mean can be a
// tight cluster or half the room at 95 and half at 60, and those need different
// responses. Buckets are fixed rather than derived from the threshold so the
// shape stays comparable as the user drags the threshold around; the COLOUR is
// what reacts, turning red for any bucket that sits below the line.
const BUCKETS = [
  { label: "<60", lo: 0, hi: 60 },
  { label: "60–70", lo: 60, hi: 70 },
  { label: "70–75", lo: 70, hi: 75 },
  { label: "75–85", lo: 75, hi: 85 },
  { label: "85–95", lo: 85, hi: 95 },
  { label: "95+", lo: 95, hi: 101 },
];

function DistributionChart({
  students,
  threshold,
}: {
  students: StudentReport[];
  threshold: number;
}) {
  const data = BUCKETS.map((b) => ({
    label: b.label,
    students: students.filter((s) => {
      const p = s.overall.pct ?? 0;
      return p >= b.lo && p < b.hi;
    }).length,
    // A bucket counts as failing when its TOP is at or below the line — i.e.
    // everyone in it is short, not merely some.
    short: b.hi <= threshold,
  }));

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h3 className="text-sm font-medium text-foreground">Attendance spread</h3>
      <ChartContainer
        height={180}
        label={`Number of students in each attendance band, against a ${threshold}% threshold`}
      >
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <XAxis dataKey="label" {...AXIS_PROPS} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Bar dataKey="students" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell
                key={d.label}
                fill={d.short ? "var(--status-absent)" : "var(--chart-1)"}
              />
            ))}
          </Bar>
          <ChartTooltip formatter={(v) => [`${v} students`, "In band"]} />
        </BarChart>
      </ChartContainer>
    </section>
  );
}

// WHICH SUBJECT is bleeding attendance — invisible in the table without
// expanding sixty rows one at a time. Summed across students per subject index,
// which is the shape `students[].subjects[i]` already arrives in.
function SubjectAverageChart({
  report,
  threshold,
}: {
  report: AttendanceReport;
  threshold: number;
}) {
  const data = report.subjectsMeta.map((meta, i) => {
    let attended = 0;
    let total = 0;
    for (const s of report.students) {
      const cell = s.subjects[i];
      if (!cell) continue;
      attended += cell.attended;
      total += cell.total;
    }
    return {
      code: meta.code,
      name: meta.name,
      pct: total > 0 ? Math.round((attended / total) * 100) : 0,
      total,
    };
  }).filter((d) => d.total > 0);

  if (data.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h3 className="text-sm font-medium text-foreground">Average by subject</h3>
      <ChartContainer
        height={180}
        label={`Class average attendance for each subject, against a ${threshold}% threshold`}
      >
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="code"
            {...AXIS_PROPS}
            tick={{ ...AXIS_PROPS.tick, fontFamily: "var(--font-mono)" }}
          />
          <YAxis domain={[0, 100]} unit="%" {...AXIS_PROPS} />
          <ReferenceLine
            y={threshold}
            stroke="var(--foreground)"
            strokeOpacity={0.45}
            strokeDasharray="4 4"
          />
          <Bar dataKey="pct" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell
                key={d.code}
                fill={d.pct < threshold ? "var(--status-absent)" : "var(--chart-1)"}
              />
            ))}
          </Bar>
          <ChartTooltip
            formatter={(v) => [`${v}%`, "Class average"]}
            labelFormatter={(code) => data.find((d) => d.code === code)?.name ?? String(code)}
          />
        </BarChart>
      </ChartContainer>
    </section>
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
        <EmptyState
          size="sm"
          title="No attendance has been marked for this class in the active semester yet."
        />
      ) : (
        <>
          <StatCardGrid className="lg:grid-cols-3">
            <StatCard
              label="Class average"
              value={fmtPct(avg)}
              tone={avg !== null && avg < threshold ? "destructive" : "success"}
              hint="Present and OD count as attended"
            />
            <StatCard
              label={`Below ${threshold}%`}
              value={defaulters}
              tone={defaulters > 0 ? "destructive" : "success"}
              hint={`of ${withData.length} students with marks`}
            />
            <StatCard
              label="Scope"
              value={report.students.length}
              hint={`students · ${report.subjectsMeta.length} subjects`}
            />
          </StatCardGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <DistributionChart students={withData} threshold={threshold} />
            <SubjectAverageChart report={report} threshold={threshold} />
          </div>
        </>
      )}

      <Table containerClassName={TABLE_FRAME} className="min-w-140">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Register no.</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Attended</TableHead>
            <TableHead className="text-right">Overall</TableHead>
          </TableRow>
        </TableHeader>
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
      </Table>
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
