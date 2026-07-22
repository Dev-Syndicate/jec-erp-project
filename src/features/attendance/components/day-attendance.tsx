// Day attendance — the class teacher's review + correction of the official DAY
// (Master) attendance for a class on a date. Period 1 seeds it automatically; a
// correction here is "sticky" (manuallyAdjusted) so a later period-1 change won't
// overwrite it. Only the changed rows are submitted, so untouched auto rows stay
// auto. Authorized server-side to the class advisor / HOD / Super Admin.
"use client";

import { useState } from "react";
import { CalendarCheck2, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/app/(app)/page-header";
import { FormSelect } from "@/features/attendance/components/form-select";
import { STATUS_META } from "@/features/attendance/components/status-meta";
import { STATUSES, type AttendanceStatus, type DayView } from "@/features/attendance/types";
import {
  useClassOptions,
  useDayAttendance,
  useSaveDayAttendance,
} from "@/features/attendance/hooks/use-attendance";

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

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function DayAttendance() {
  const classes = useClassOptions();
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayStr);

  const activeClasses = (classes.data ?? []).filter((c) => c.isActive);
  const programOptions = [
    ...new Map(activeClasses.map((c) => [c.programId, c.programLabel])).entries(),
  ].map(([id, label]) => ({ value: id, label }));
  const classesInProgram = activeClasses.filter((c) => c.programId === programId);

  const enabled = !!classId && !!date;
  const view = useDayAttendance(classId || null, date, enabled);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Attendance · Day record"
        title="Day attendance"
        description="Review and correct a class's official day (overall) attendance. Period 1 sets it automatically; a correction here sticks — a later period-1 change won't overwrite it."
      />

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Program">
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
        </Field>
        <Field label="Class">
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
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>
      </div>

      {classId === "" ? (
        <p className="text-sm text-muted-foreground">Pick a program, then a class, to review the day attendance.</p>
      ) : view.isPending ? (
        <p className="text-sm text-muted-foreground">Loading day attendance…</p>
      ) : view.isError ? (
        <FormError>{errorMessage(view.error)}</FormError>
      ) : view.data ? (
        <Loaded key={`${classId}-${date}`} view={view.data} />
      ) : null}
    </div>
  );
}

function Loaded({ view }: { view: DayView }) {
  const initial: Record<string, AttendanceStatus | null> = {};
  for (const s of view.roster) initial[s.studentId] = s.status;

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | null>>(initial);
  const [baseline, setBaseline] = useState<Record<string, AttendanceStatus | null>>(initial);
  const [savedOnce, setSavedOnce] = useState(false);
  const save = useSaveDayAttendance();

  const setOne = (studentId: string, status: AttendanceStatus) =>
    setStatuses((prev) => ({ ...prev, [studentId]: status }));

  // Only submit rows the teacher actually changed — so untouched auto rows stay
  // auto (never flagged manuallyAdjusted).
  const changed = view.roster.filter(
    (s) => statuses[s.studentId] != null && statuses[s.studentId] !== baseline[s.studentId],
  );

  function submit() {
    if (changed.length === 0) return;
    save.mutate(
      {
        classId: view.classId,
        date: view.date,
        entries: changed.map((s) => ({
          studentId: s.studentId,
          status: statuses[s.studentId] as AttendanceStatus,
        })),
      },
      {
        onSuccess: () => {
          setSavedOnce(true);
          setBaseline({ ...statuses });
        },
      },
    );
  }

  if (view.roster.length === 0) {
    return (
      <FormError>
        No students are enrolled in this class for the active year. Enrol students under People →
        Students first.
      </FormError>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{view.classLabel}</span>
        {" · "}
        {view.date}
      </p>

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-140 border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
              <th className="w-10 px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Register no.</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 text-right font-medium">Day status</th>
            </tr>
          </thead>
          <tbody>
            {view.roster.map((s, i) => {
              const edited = statuses[s.studentId] !== baseline[s.studentId];
              return (
                <tr key={s.studentId} className="border-b border-foreground/10 last:border-b-0">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.registerNumber}</td>
                  <td className="px-3 py-2">{s.displayName}</td>
                  <td className="px-3 py-2">
                    <SourceBadge status={s.status} manuallyAdjusted={s.manuallyAdjusted} edited={edited} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {STATUSES.map((st) => {
                        const active = statuses[s.studentId] === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setOne(s.studentId, st)}
                            className={`min-w-9 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                              active
                                ? STATUS_META[st].active
                                : "border-border text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {STATUS_META[st].short}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {save.isError ? (
            <span className="text-destructive">{errorMessage(save.error)}</span>
          ) : savedOnce && changed.length === 0 && !save.isPending ? (
            <span className="inline-flex items-center gap-1.5 text-status-present">
              <Check className="size-4" /> Corrections saved
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CalendarCheck2 className="size-4" />
              {changed.length === 0 ? "No changes" : `${changed.length} to correct`}
            </span>
          )}
        </div>
        <Button onClick={submit} disabled={save.isPending || changed.length === 0}>
          {save.isPending ? "Saving…" : "Save corrections"}
        </Button>
      </div>
    </div>
  );
}

// Where this day's status came from: a manual correction, the period-1 auto-seed,
// or nothing yet. `edited` flags an unsaved local change.
function SourceBadge({
  status,
  manuallyAdjusted,
  edited,
}: {
  status: AttendanceStatus | null;
  manuallyAdjusted: boolean;
  edited: boolean;
}) {
  if (edited) {
    return <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Edited</span>;
  }
  if (status === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (manuallyAdjusted) {
    return (
      <span className="rounded-md bg-status-excused/10 px-2 py-0.5 text-xs font-medium text-status-excused">
        Corrected
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Auto · P1</span>;
}
