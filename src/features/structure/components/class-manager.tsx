// Class management — list + create/edit/deactivate/delete. Super-Admin only
// (the page gates with AuthGate requireRole; the API re-checks every call). A
// Class is a group WITHIN a Program: a year + section (e.g. II-A). Follows the
// DegreeManager reference shape for the Structure slice.
"use client";

import { useState } from "react";
import { Plus, Pencil, Power, Trash2 } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/app/(app)/page-header";
import type { Class, Program } from "@/features/structure/types";
import { usePrograms } from "@/features/structure/hooks/use-programs";
import {
  useClasses,
  useCreateClass,
  useDeleteClass,
  useUpdateClass,
} from "@/features/structure/hooks/use-classes";

// Sections a class can take. Year options are derived from the program duration.
const SECTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}

const programLabel = (p: Program) => `${p.degreeCode} · ${p.branchCode}`;

// Fixed (non-brand) status pill — active vs deactivated.
function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider ${
        active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
      }`}
    >
      <span className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground"}`} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function ClassManager() {
  const { data: classes, isPending, isError, error } = useClasses();

  // null = closed; "new" = create; a Class = edit that row.
  const [editing, setEditing] = useState<Class | "new" | null>(null);
  const [deleting, setDeleting] = useState<Class | null>(null);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Structure · Classes"
          title="Classes"
          description="Class groups within a program — a year and section (e.g. II-A). Attendance and marks are recorded against these."
        />
        <Button onClick={() => setEditing("new")} data-icon="inline-start">
          <Plus />
          New class
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading classes…</p>
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : classes.length === 0 ? (
        <EmptyState onAdd={() => setEditing("new")} />
      ) : (
        <div className="rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Program</TableHead>
                <TableHead className="text-right">Year</TableHead>
                <TableHead>Section</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.programLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.year}</TableCell>
                  <TableCell className="font-medium">{c.section}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.studentCount}
                  </TableCell>
                  <TableCell>
                    <StatusPill active={c.isActive} />
                  </TableCell>
                  <TableCell>
                    <RowActions
                      cls={c}
                      onEdit={() => setEditing(c)}
                      onDelete={() => setDeleting(c)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing !== null && (
        <ClassFormDialog
          cls={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting !== null && <DeleteDialog cls={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">No classes yet.</p>
      <Button variant="outline" onClick={onAdd} data-icon="inline-start">
        <Plus />
        Add the first class
      </Button>
    </div>
  );
}

// Per-row actions. Deactivate/reactivate always available; hard delete only when
// the class has no enrolled students (otherwise the API returns 409 — we hide it
// to make that obvious up front).
function RowActions({
  cls,
  onEdit,
  onDelete,
}: {
  cls: Class;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateClass();
  const canDelete = cls.studentCount === 0;

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit class">
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={update.isPending}
        onClick={() => update.mutate({ id: cls.id, input: { isActive: !cls.isActive } })}
        aria-label={cls.isActive ? "Deactivate class" : "Reactivate class"}
        title={cls.isActive ? "Deactivate" : "Reactivate"}
      >
        <Power className={cls.isActive ? "" : "text-muted-foreground"} />
      </Button>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete class"
          title="Delete"
        >
          <Trash2 className="text-destructive" />
        </Button>
      )}
    </div>
  );
}

// Create (cls = null) or edit an existing class. On create the Program is a
// dropdown that bounds the Year options; on edit the Program is fixed and only
// Year + Section are editable.
function ClassFormDialog({ cls, onClose }: { cls: Class | null; onClose: () => void }) {
  const isEdit = cls !== null;
  const create = useCreateClass();
  const update = useUpdateClass();

  const { data: programs } = usePrograms();
  const activePrograms = (programs ?? []).filter((p) => p.isActive);

  const [programId, setProgramId] = useState(cls?.programId ?? "");
  const [year, setYear] = useState(cls ? String(cls.year) : "");
  const [section, setSection] = useState(cls?.section ?? "");

  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  // The selected program's degree duration bounds the Year options. On edit the
  // program is fixed but may not be in the list (e.g. deactivated), so fall back
  // to the class's own year for the dropdown bound.
  const selectedProgram = activePrograms.find((p) => p.id === programId);
  const durationYears = selectedProgram?.durationYears ?? (cls ? cls.year : 0);
  const yearOptions = Array.from({ length: durationYears }, (_, i) => i + 1);

  const yearNum = Number(year);
  const valid =
    programId !== "" &&
    Number.isInteger(yearNum) &&
    yearNum >= 1 &&
    /^[A-H]$/.test(section);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (isEdit) {
      update.mutate({ id: cls.id, input: { year: yearNum, section } }, { onSuccess: onClose });
    } else {
      // advisorId is deferred — no staff-listing endpoint yet (People slice).
      create.mutate({ programId, year: yearNum, section }, { onSuccess: onClose });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit class" : "New class"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this class's year and section. The program it belongs to can't be changed."
              : "Add a class group within a program — pick the program, then its year and section."}
          </DialogDescription>
        </DialogHeader>

        <form id="class-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="class-program">Program</Label>
            {isEdit ? (
              // Program is fixed after create — show it read-only.
              <div className="flex h-10 items-center rounded-lg border border-input bg-muted/40 px-3 font-mono text-xs text-muted-foreground">
                {cls.programLabel}
              </div>
            ) : (
              <Select
                value={programId}
                onValueChange={(v) => {
                  setProgramId((v as string) ?? "");
                  // Reset year — the duration bound just changed.
                  setYear("");
                }}
              >
                <SelectTrigger id="class-program" className="h-10! w-full">
                  <SelectValue placeholder="Select a program">
                    {(id) => {
                      const p = activePrograms.find((x) => x.id === id);
                      return p ? programLabel(p) : "Select a program";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {activePrograms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {programLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="class-year">Year</Label>
              <Select
                value={year}
                onValueChange={(v) => setYear((v as string) ?? "")}
                disabled={yearOptions.length === 0}
              >
                <SelectTrigger id="class-year" className="h-10! w-full">
                  <SelectValue placeholder="Year">{(v) => (v ? String(v) : "Year")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="class-section">Section</Label>
              <Select value={section} onValueChange={(v) => setSection((v as string) ?? "")}>
                <SelectTrigger id="class-section" className="h-10! w-full">
                  <SelectValue placeholder="Section">
                    {(v) => (v ? String(v) : "Section")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SECTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Advisor picker is deferred until the People slice exposes a staff-listing endpoint. */}

          {mutationError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage(mutationError)}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="class-form" disabled={!valid || pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ cls, onClose }: { cls: Class; onClose: () => void }) {
  const del = useDeleteClass();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete “{cls.programLabel} · Year {cls.year}-{cls.section}”?
          </DialogTitle>
          <DialogDescription>
            This permanently removes the class. It has no enrolled students, so nothing depends on
            it. To keep it for history instead, deactivate it.
          </DialogDescription>
        </DialogHeader>
        {del.isError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage(del.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={del.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={() => del.mutate(cls.id, { onSuccess: onClose })}
          >
            {del.isPending ? "Deleting…" : "Delete class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
