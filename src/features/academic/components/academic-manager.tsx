// Academic-time management — academic years and their Odd/Even semesters, with
// the one-active-at-a-time switch that every attendance/marks/timetable record
// keys off. Super-Admin only (page gates with AuthGate; the API re-checks). The
// screen leads with the active period because that pointer is the whole point.
"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, CalendarDays, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/app/(app)/page-header";
import type { AcademicYear, Semester, SemesterKind } from "@/features/academic/types";
import {
  useAcademicYears,
  useActivateAcademicYear,
  useActivateSemester,
  useCreateAcademicYear,
  useCreateSemester,
  useDeleteAcademicYear,
  useDeleteSemester,
  useUpdateAcademicYear,
  useUpdateSemester,
} from "@/features/academic/hooks/use-academic";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}

const kindLabel = (k: SemesterKind) => (k === "ODD" ? "Odd" : "Even");

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
const isoToDateInput = (iso: string) => (iso ? iso.slice(0, 10) : "");

// A prominent, fixed (non-brand) pill marking the active year/semester.
function ActivePill({ children = "Active" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-emerald-600">
      <CheckCircle2 className="size-3" />
      {children}
    </span>
  );
}

// Dialog state shapes.
type YearDialog = AcademicYear | "new" | null;
type SemesterDialogState =
  | { yearId: string; yearName: string; kind: SemesterKind; semester?: Semester }
  | null;
type DeleteTarget =
  | { type: "year"; id: string; label: string }
  | { type: "semester"; id: string; label: string }
  | null;

export function AcademicManager() {
  const { data: years, isPending, isError, error } = useAcademicYears();
  const [yearDialog, setYearDialog] = useState<YearDialog>(null);
  const [semesterDialog, setSemesterDialog] = useState<SemesterDialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Academic · Time"
          title="Years & semesters"
          description="Set up academic years and their Odd/Even semesters. Exactly one year and one semester are active at a time — attendance, marks and timetables are recorded against the active semester."
        />
        <Button onClick={() => setYearDialog("new")} data-icon="inline-start">
          <Plus />
          New year
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading academic years…</p>
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        <>
          <ActivePeriodBanner years={years} />
          {years.length === 0 ? (
            <EmptyState onAdd={() => setYearDialog("new")} />
          ) : (
            <div className="flex flex-col gap-4">
              {years.map((year) => (
                <YearCard
                  key={year.id}
                  year={year}
                  onEdit={() => setYearDialog(year)}
                  onDelete={() => setDeleteTarget({ type: "year", id: year.id, label: year.name })}
                  onAddSemester={(kind) =>
                    setSemesterDialog({ yearId: year.id, yearName: year.name, kind })
                  }
                  onEditSemester={(semester) =>
                    setSemesterDialog({
                      yearId: year.id,
                      yearName: year.name,
                      kind: semester.kind,
                      semester,
                    })
                  }
                  onDeleteSemester={(semester) =>
                    setDeleteTarget({
                      type: "semester",
                      id: semester.id,
                      label: `${year.name} · ${kindLabel(semester.kind)}`,
                    })
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {yearDialog !== null && (
        <YearFormDialog
          year={yearDialog === "new" ? null : yearDialog}
          onClose={() => setYearDialog(null)}
        />
      )}
      {semesterDialog !== null && (
        <SemesterFormDialog state={semesterDialog} onClose={() => setSemesterDialog(null)} />
      )}
      {deleteTarget !== null && (
        <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

function ActivePeriodBanner({ years }: { years: AcademicYear[] }) {
  const activeYear = years.find((y) => y.isActive);
  const activeSemester = activeYear?.semesters.find((s) => s.isActive);

  let message: React.ReactNode;
  if (activeYear && activeSemester) {
    message = (
      <>
        <span className="font-heading text-base font-semibold text-foreground">
          {activeYear.name} · {kindLabel(activeSemester.kind)} semester
        </span>
        <span className="text-sm text-muted-foreground">is the active period.</span>
      </>
    );
  } else if (activeYear) {
    message = (
      <>
        <span className="font-heading text-base font-semibold text-foreground">
          {activeYear.name}
        </span>
        <span className="text-sm text-muted-foreground">
          is active, but no semester is. Activate Odd or Even below.
        </span>
      </>
    );
  } else {
    message = (
      <span className="text-sm text-muted-foreground">
        No active academic period yet. Create a year, add a semester, and activate it.
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <CalendarDays className="size-4.5" />
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">{message}</div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">No academic years yet.</p>
      <Button variant="outline" onClick={onAdd} data-icon="inline-start">
        <Plus />
        Add the first year
      </Button>
    </div>
  );
}

function YearCard({
  year,
  onEdit,
  onDelete,
  onAddSemester,
  onEditSemester,
  onDeleteSemester,
}: {
  year: AcademicYear;
  onEdit: () => void;
  onDelete: () => void;
  onAddSemester: (kind: SemesterKind) => void;
  onEditSemester: (semester: Semester) => void;
  onDeleteSemester: (semester: Semester) => void;
}) {
  const activate = useActivateAcademicYear();
  const odd = year.semesters.find((s) => s.kind === "ODD");
  const even = year.semesters.find((s) => s.kind === "EVEN");

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-start justify-between gap-4 px-4 py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-heading text-base font-semibold text-foreground">{year.name}</span>
            {year.isActive && <ActivePill>Active year</ActivePill>}
          </div>
          <span className="text-sm text-muted-foreground">
            {formatDate(year.startDate)} – {formatDate(year.endDate)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!year.isActive && (
            <Button
              variant="outline"
              size="sm"
              disabled={activate.isPending}
              onClick={() => activate.mutate(year.id)}
            >
              {activate.isPending ? "Activating…" : "Set active"}
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit year">
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete year">
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </div>

      <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
        {(["ODD", "EVEN"] as const).map((kind) => {
          const semester = kind === "ODD" ? odd : even;
          return (
            <div key={kind} className="bg-card p-4">
              {semester ? (
                <SemesterRow
                  semester={semester}
                  onEdit={() => onEditSemester(semester)}
                  onDelete={() => onDeleteSemester(semester)}
                />
              ) : (
                <MissingSemesterSlot kind={kind} onAdd={() => onAddSemester(kind)} />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SemesterRow({
  semester,
  onEdit,
  onDelete,
}: {
  semester: Semester;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const activate = useActivateSemester();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
            {kindLabel(semester.kind)} semester
          </span>
          {semester.isActive && <ActivePill />}
        </div>
        <span className="text-sm text-foreground">
          {formatDate(semester.startDate)} – {formatDate(semester.endDate)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {!semester.isActive && (
          <Button
            variant="outline"
            size="sm"
            disabled={activate.isPending}
            onClick={() => activate.mutate(semester.id)}
          >
            {activate.isPending ? "…" : "Set active"}
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit semester">
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete semester">
          <Trash2 className="text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function MissingSemesterSlot({ kind, onAdd }: { kind: SemesterKind; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground">
        {kindLabel(kind)} semester
      </span>
      <Button variant="ghost" size="sm" onClick={onAdd} data-icon="inline-start">
        <Plus />
        Add
      </Button>
    </div>
  );
}

// A labelled date field.
function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10!"
        required
      />
    </div>
  );
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

function YearFormDialog({ year, onClose }: { year: AcademicYear | null; onClose: () => void }) {
  const isEdit = year !== null;
  const create = useCreateAcademicYear();
  const update = useUpdateAcademicYear();

  const [name, setName] = useState(year?.name ?? "");
  const [startDate, setStartDate] = useState(isoToDateInput(year?.startDate ?? ""));
  const [endDate, setEndDate] = useState(isoToDateInput(year?.endDate ?? ""));

  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;
  const valid = name.trim() !== "" && startDate !== "" && endDate !== "" && startDate < endDate;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const input = { name: name.trim(), startDate, endDate };
    if (isEdit) update.mutate({ id: year.id, input }, { onSuccess: onClose });
    else create.mutate(input, { onSuccess: onClose });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit academic year" : "New academic year"}</DialogTitle>
          <DialogDescription>
            Name the year (e.g. 2025-2026) and set its date range. Activate it separately once
            created.
          </DialogDescription>
        </DialogHeader>
        <form id="year-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="year-name">Name</Label>
            <Input
              id="year-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="2025-2026"
              className="h-10!"
              autoFocus
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DateField id="year-start" label="Start date" value={startDate} onChange={setStartDate} />
            <DateField id="year-end" label="End date" value={endDate} onChange={setEndDate} />
          </div>
          {startDate !== "" && endDate !== "" && startDate >= endDate && (
            <FormError>Start date must be before the end date.</FormError>
          )}
          {mutationError && <FormError>{errorMessage(mutationError)}</FormError>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="year-form" disabled={!valid || pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create year"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SemesterFormDialog({
  state,
  onClose,
}: {
  state: NonNullable<SemesterDialogState>;
  onClose: () => void;
}) {
  const isEdit = state.semester !== undefined;
  const create = useCreateSemester();
  const update = useUpdateSemester();

  const [startDate, setStartDate] = useState(isoToDateInput(state.semester?.startDate ?? ""));
  const [endDate, setEndDate] = useState(isoToDateInput(state.semester?.endDate ?? ""));

  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;
  const valid = startDate !== "" && endDate !== "" && startDate < endDate;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (isEdit && state.semester) {
      update.mutate({ id: state.semester.id, input: { startDate, endDate } }, { onSuccess: onClose });
    } else {
      create.mutate(
        { academicYearId: state.yearId, kind: state.kind, startDate, endDate },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit" : "Add"} {kindLabel(state.kind)} semester
          </DialogTitle>
          <DialogDescription>
            {state.yearName} · {kindLabel(state.kind)} semester. Set its date window; activate it
            separately.
          </DialogDescription>
        </DialogHeader>
        <form id="semester-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <DateField id="sem-start" label="Start date" value={startDate} onChange={setStartDate} />
            <DateField id="sem-end" label="End date" value={endDate} onChange={setEndDate} />
          </div>
          {startDate !== "" && endDate !== "" && startDate >= endDate && (
            <FormError>Start date must be before the end date.</FormError>
          )}
          {mutationError && <FormError>{errorMessage(mutationError)}</FormError>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="semester-form" disabled={!valid || pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Add semester"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  target,
  onClose,
}: {
  target: NonNullable<DeleteTarget>;
  onClose: () => void;
}) {
  const deleteYear = useDeleteAcademicYear();
  const deleteSemester = useDeleteSemester();
  const mutation = target.type === "year" ? deleteYear : deleteSemester;
  const noun = target.type === "year" ? "academic year" : "semester";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {noun} “{target.label}”?</DialogTitle>
          <DialogDescription>
            This permanently removes the {noun}. It can only be deleted if it isn’t active and has
            no records depending on it.
          </DialogDescription>
        </DialogHeader>
        {mutation.isError && <FormError>{errorMessage(mutation.error)}</FormError>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(target.id, { onSuccess: onClose })}
          >
            {mutation.isPending ? "Deleting…" : `Delete ${noun}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
