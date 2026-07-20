// Timetable grid — build the Mon–Fri period grid for a class in the active
// semester. Pick a class, then each (day, period) cell holds a subject + the
// faculty who takes it. Subjects are filtered to the class's curriculum semester
// and program; faculty to the program. One slot per (class, day, period).
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/app/(app)/page-header";
import { FormSelect } from "@/features/timetable/components/form-select";
import { DAYS, PERIODS, type DayOfWeek, type TimetableSlot } from "@/features/timetable/types";
import {
  useClassOptions,
  useDeleteSlot,
  useFacultyOptions,
  useSubjectOptions,
  useTimetable,
  useUpsertSlot,
} from "@/features/timetable/hooks/use-timetable";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}

const DAY_LABEL: Record<DayOfWeek, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
};

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

export function TimetableManager() {
  const classes = useClassOptions();
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");
  const [editing, setEditing] = useState<{
    day: DayOfWeek;
    period: number;
    slot?: TimetableSlot;
  } | null>(null);

  const activeClasses = (classes.data ?? []).filter((c) => c.isActive);

  // Program picker options are derived from the classes themselves — so only
  // programs that actually have classes appear, and no extra endpoint is needed.
  const programOptions = [
    ...new Map(activeClasses.map((c) => [c.programId, c.programLabel])).entries(),
  ].map(([id, label]) => ({ value: id, label }));

  const classesInProgram = activeClasses.filter((c) => c.programId === programId);
  const selectedClass = activeClasses.find((c) => c.id === classId);

  const view = useTimetable(classId || null);

  const slotAt = (day: DayOfWeek, period: number): TimetableSlot | undefined =>
    view.data?.slots.find((s) => s.dayOfWeek === day && s.period === period);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Curriculum · Timetable"
        title="Timetable"
        description="Build the Mon–Fri period grid for a class in the active semester. Each cell holds a subject and the faculty who takes it."
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Program</span>
          <div className="w-56">
            <FormSelect
              value={programId}
              onChange={(v) => {
                setProgramId(v);
                setClassId(""); // classes differ per program — reset the selection
              }}
              options={programOptions}
              placeholder={classes.isPending ? "Loading…" : "Select a program"}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Class</span>
          <div className="w-40">
            <FormSelect
              value={classId}
              onChange={setClassId}
              options={classesInProgram.map((c) => ({ value: c.id, label: c.shortLabel }))}
              placeholder={
                programId === ""
                  ? "Pick a program first"
                  : classesInProgram.length === 0
                    ? "No classes in this program"
                    : "Select a class"
              }
              disabled={programId === ""}
            />
          </div>
        </div>
      </div>

      {classId === "" ? (
        <p className="text-sm text-muted-foreground">
          {programId === ""
            ? "Pick a program, then a class, to view or edit its timetable."
            : "Pick a class to view or edit its timetable."}
        </p>
      ) : view.isPending ? (
        <p className="text-sm text-muted-foreground">Loading timetable…</p>
      ) : view.isError ? (
        <FormError>{view.error instanceof Error ? view.error.message : "Failed to load timetable."}</FormError>
      ) : view.data ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{view.data.semesterLabel}</span>
            {" · "}
            Curriculum semester {view.data.curriculumSemesterNumber}
          </p>

          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <table className="w-full min-w-170 table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b border-foreground/10 bg-muted/40">
                  <th className="w-16 px-3 py-2 text-left font-medium text-muted-foreground">
                    Period
                  </th>
                  {DAYS.map((day) => (
                    <th
                      key={day}
                      className="px-3 py-2 text-center font-medium text-muted-foreground"
                    >
                      {DAY_LABEL[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map((period) => (
                  <tr key={period} className="border-b border-foreground/10 last:border-b-0">
                    <td className="px-3 py-2 align-top font-mono text-xs text-muted-foreground">
                      P{period}
                    </td>
                    {DAYS.map((day) => {
                      const slot = slotAt(day, period);
                      return (
                        <td key={day} className="p-1 align-top">
                          {slot ? (
                            <button
                              type="button"
                              onClick={() => setEditing({ day, period, slot })}
                              className="flex min-h-16 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-center transition-colors hover:bg-muted"
                            >
                              <span className="font-medium">{slot.subjectCode}</span>
                              <span className="w-full truncate text-center text-xs text-muted-foreground">
                                {slot.facultyName}
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditing({ day, period })}
                              aria-label={`Add period ${period} on ${day}`}
                              className="flex min-h-16 w-full items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-muted hover:text-muted-foreground"
                            >
                              <Plus className="size-4" />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {editing && selectedClass && (
        <SlotDialog
          classId={classId}
          programId={selectedClass.programId}
          curriculumSemesterNumber={view.data?.curriculumSemesterNumber ?? 0}
          day={editing.day}
          period={editing.period}
          slot={editing.slot}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SlotDialog({
  classId,
  programId,
  curriculumSemesterNumber,
  day,
  period,
  slot,
  onClose,
}: {
  classId: string;
  programId: string;
  curriculumSemesterNumber: number;
  day: DayOfWeek;
  period: number;
  slot?: TimetableSlot;
  onClose: () => void;
}) {
  const subjects = useSubjectOptions();
  const faculty = useFacultyOptions();
  const upsert = useUpsertSlot();
  const del = useDeleteSlot();

  const [subjectId, setSubjectId] = useState(slot?.subjectId ?? "");
  const [facultyId, setFacultyId] = useState(slot?.facultyId ?? "");

  const subjectOptions = (subjects.data ?? [])
    .filter(
      (s) =>
        s.isActive && s.programId === programId && s.semesterNumber === curriculumSemesterNumber,
    )
    .map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }));

  const facultyOptions = (faculty.data ?? [])
    .filter((f) => f.status === "ACTIVE" && f.programId === programId)
    .map((f) => ({ value: f.id, label: f.name }));

  const valid = subjectId !== "" && facultyId !== "";
  const pending = upsert.isPending || del.isPending;
  const mutationError = upsert.error ?? del.error;

  function save() {
    if (!valid) return;
    upsert.mutate(
      { classId, dayOfWeek: day, period, subjectId, facultyId },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {slot ? "Edit" : "Add"} — {DAY_LABEL[day]} · Period {period}
          </DialogTitle>
          <DialogDescription>
            Place a subject and the faculty who takes it in this period.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {subjects.isPending ? (
            <p className="text-sm text-muted-foreground">Loading subjects…</p>
          ) : subjectOptions.length === 0 ? (
            // No curriculum subjects for this class's semester — nothing to schedule.
            <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
              There are no subjects to add. Set up subjects for{" "}
              <span className="font-medium text-foreground">
                semester {curriculumSemesterNumber}
              </span>{" "}
              of this program under <span className="font-medium text-foreground">Curriculum → Subjects</span>,
              then come back to schedule them.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="slot-subject">Subject</Label>
                <FormSelect
                  id="slot-subject"
                  value={subjectId}
                  onChange={setSubjectId}
                  options={subjectOptions}
                  placeholder="Select subject"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="slot-faculty">Faculty</Label>
                <FormSelect
                  id="slot-faculty"
                  value={facultyId}
                  onChange={setFacultyId}
                  options={facultyOptions}
                  placeholder={
                    facultyOptions.length === 0 ? "No faculty in this program" : "Select faculty"
                  }
                />
              </div>
            </>
          )}
          {mutationError && <FormError>{errorMessage(mutationError)}</FormError>}
        </div>

        <DialogFooter className="sm:justify-between">
          {slot ? (
            <Button
              variant="ghost"
              disabled={pending}
              className="text-destructive hover:text-destructive"
              onClick={() => del.mutate({ id: slot.id, classId }, { onSuccess: onClose })}
            >
              Clear
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!valid || pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
