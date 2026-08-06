// Arrange cover — assign a stand-in teacher for a period whose usual teacher is
// away, so the hour can still be marked.
//
// Marking a period is the slot teacher's alone; no role overrides it (see
// src/app/api/attendance/access.ts). That left a class unable to record
// attendance on a day its teacher was absent. Assigning cover here is a DATED
// grant: it lets the covering teacher mark that ONE hour on that ONE date and
// leaves the permanent timetable untouched.
//
// HOD / Super Admin only, scoped to the department that OWNS the class — the API
// re-checks, and so does the covering-teacher picker below. Note the assigner
// does NOT gain the right to mark the hour themselves; they name who may.
"use client";

import { useState } from "react";
import { RotateCcw, UserRoundCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { errorMessage } from "@/lib/errors";
import { FormError } from "@/components/form-error";
import { PageShell } from "@/app/(app)/page-shell";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/app/(app)/page-header";
import { FormSelect } from "@/components/form-select";
import type { CoverPeriod, CoverView, Weekday } from "@/features/attendance/types";
import {
  useAssignCover,
  useClassOptions,
  useCover,
  useRemoveCover,
} from "@/features/attendance/hooks/use-attendance";
import { useFacultyOptions } from "@/features/attendance/hooks/use-faculty-options";

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
};

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function CoverManager() {
  const classes = useClassOptions();
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayStr);

  const activeClasses = (classes.data ?? []).filter((c) => c.isActive);
  const programOptions = [
    ...new Map(activeClasses.map((c) => [c.programId, c.programLabel])).entries(),
  ].map(([id, label]) => ({ value: id, label }));

  // A HOD sees one program — auto-select and hide the picker; Super Admin keeps it.
  const singleProgram = programOptions.length === 1;
  const effProgramId = singleProgram ? programOptions[0].value : programId;
  const classesInProgram = activeClasses.filter((c) => c.programId === effProgramId);

  const enabled = !!classId && !!date;
  const view = useCover(classId || null, date, enabled);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Attendance · Cover"
        title="Arrange cover"
        description="Assign a stand-in for a period whose teacher is away, so the hour can still be marked. Cover applies to the chosen date only — the timetable itself doesn't change."
      />

      <div className="flex flex-wrap items-end gap-4">
        {!singleProgram && (
          <Field label="Program">
            <div className="w-full sm:w-56">
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
        )}
        <Field label="Class">
          <div className="w-full sm:w-40">
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
        </Field>
        <Field label="Date">
          <Input
            size="lg"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </div>

      {classes.isPending ? (
        <LoadingState label="Loading classes…" />
      ) : classId === "" ? (
        <EmptyState size="sm" title="Pick a class and a date to see that day&rsquo;s periods." />
      ) : view.isPending ? (
        <LoadingState label="Loading the day&rsquo;s periods…" />
      ) : view.isError ? (
        <FormError>{errorMessage(view.error)}</FormError>
      ) : view.data ? (
        <Loaded view={view.data} />
      ) : null}
    </PageShell>
  );
}

function Loaded({ view }: { view: CoverView }) {
  if (view.periods.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No periods are scheduled for this class on {view.date}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {view.date} · <span className="font-medium text-foreground">{WEEKDAY_LABEL[view.weekday]}</span>
        {view.followsDay && (
          <Badge variant="warning" className="ml-2">
            Working Saturday — runs {WEEKDAY_LABEL[view.followsDay]}&rsquo;s timetable
          </Badge>
        )}
      </p>

      <div className="flex flex-col gap-2">
        {view.periods.map((p) => (
          // The owning department comes from the view, not the class list: it's
          // what decides who may cover, and only the server knows it per class.
          <PeriodRow
            key={p.slotId}
            period={p}
            date={view.date}
            departmentId={view.departmentId}
          />
        ))}
      </div>
    </div>
  );
}

function PeriodRow({
  period,
  date,
  departmentId,
}: {
  period: CoverPeriod;
  date: string;
  departmentId: string;
}) {
  const [open, setOpen] = useState(false);
  const covered = period.substitution;

  return (
    <div className="rounded-xl border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Period {period.period}
          </span>
          <span className="text-sm font-medium">
            {period.subjectCode} — {period.subjectName}
          </span>
          <span className="text-xs text-muted-foreground">
            {covered ? (
              <>
                <span className="line-through">{period.regularFacultyName}</span>{" "}
                <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                  <UserRoundCheck className="size-3" />
                  {covered.substituteName}
                </span>
                {covered.reason && <> · {covered.reason}</>}
              </>
            ) : (
              period.regularFacultyName
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {covered ? (
            <>
              <Button variant="outline" onClick={() => setOpen((v) => !v)}>
                Change
              </Button>
              <RemoveCoverButton slotId={period.slotId} date={date} />
            </>
          ) : (
            <Button variant="outline" onClick={() => setOpen((v) => !v)}>
              {open ? "Cancel" : "Assign cover"}
            </Button>
          )}
        </div>
      </div>

      {open && (
        <AssignForm
          period={period}
          date={date}
          departmentId={departmentId}
          onDone={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function AssignForm({
  period,
  date,
  departmentId,
  onDone,
}: {
  period: CoverPeriod;
  date: string;
  departmentId: string; // the class's OWNER — who may cover
  onDone: () => void;
}) {
  const faculty = useFacultyOptions(departmentId);
  const [substituteId, setSubstituteId] = useState(period.substitution?.substituteId ?? "");
  const [reason, setReason] = useState(period.substitution?.reason ?? "");
  const assign = useAssignCover();

  // Already scoped by the SERVER to whoever may teach in the class's owning
  // department — employed there or attached this semester — which is exactly what
  // POST enforces. The only filter left is local to this period: a teacher can't
  // cover their own hour (the API refuses that too).
  const options = (faculty.data ?? [])
    .filter((f) => f.userId !== period.regularFacultyId)
    .map((f) => ({ value: f.userId, label: `${f.displayName} · ${f.departmentCode}` }));

  function submit() {
    if (!substituteId) return;
    assign.mutate(
      { slotId: period.slotId, date, substituteId, reason: reason.trim() || undefined },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Covering teacher">
          <div className="w-full sm:w-64">
            <FormSelect
              value={substituteId}
              onChange={setSubstituteId}
              options={options}
              placeholder={
                faculty.isPending
                  ? "Loading…"
                  : options.length === 0
                    ? "No other staff in the department that owns this class"
                    : "Select a teacher"
              }
              disabled={faculty.isPending || options.length === 0}
            />
          </div>
        </Field>
        <Field label="Reason (optional)">
          <div className="w-full sm:w-64">
            <Input
              size="lg"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. on leave"
            />
          </div>
        </Field>
        <Button onClick={submit} disabled={!substituteId || assign.isPending}>
          {assign.isPending ? "Saving…" : "Assign"}
        </Button>
      </div>
      {assign.isError && <FormError>{errorMessage(assign.error)}</FormError>}
    </div>
  );
}

function RemoveCoverButton({ slotId, date }: { slotId: string; date: string }) {
  const remove = useRemoveCover();
  return (
    <div className="flex items-center gap-2">
      {remove.isError && (
        <span className="text-xs text-destructive">{errorMessage(remove.error)}</span>
      )}
      <Button
        variant="ghost"
        onClick={() => remove.mutate({ slotId, date })}
        disabled={remove.isPending}
        title="Remove cover — the hour reverts to its regular teacher"
      >
        {remove.isPending ? <RotateCcw className="size-4 animate-spin" /> : <X className="size-4" />}
      </Button>
    </div>
  );
}
