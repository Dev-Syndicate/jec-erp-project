// Class management — list + create/edit/deactivate/delete. Super-Admin only
// (the page gates with AuthGate requireRole; the API re-checks every call). A
// Class is a group WITHIN a Program: a year + section (e.g. II-A). Follows the
// DegreeManager reference shape for the Structure slice.
"use client";

import { useState } from "react";
import { Plus, Pencil, Power, Trash2, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/form-error";
// Aliased: each manager keeps a local `RowActions` that owns its mutation hook
// and decides which items apply; this is the menu those items render into.
import { RowActions as RowActionsMenu } from "@/components/row-actions";
import { LoadingState } from "@/components/loading-state";
import { ActiveBadge } from "@/components/status-badge";
import { errorMessage } from "@/lib/errors";
import { PageHeader } from "@/app/(app)/page-header";
import { PageShell, PageShellHeader, TABLE_FRAME } from "@/app/(app)/page-shell";
import type { Class, Program } from "@/features/structure/types";
import { usePrograms } from "@/features/structure/hooks/use-programs";
import { useStaffOptions } from "@/features/structure/hooks/use-staff";
import { useDepartments } from "@/features/structure/hooks/use-departments";
import { DepartmentSelect } from "@/components/department-select";
import {
  useClasses,
  useCreateClass,
  useDeleteClass,
  useUpdateClass,
} from "@/features/structure/hooks/use-classes";

// Sentinel for "no class teacher" — a Select value can't be empty, and user ids
// are cuids so this never collides with a real staff id.
const NO_ADVISOR = "none";

// Section is free text (upper-cased); Year options are derived from the program's
// degree duration.

const programLabel = (p: Program) => `${p.degreeCode} · ${p.branchCode}`;

export function ClassManager() {
  const { data: classes, isPending, isError, error } = useClasses();

  // null = closed; "new" = create; a Class = edit that row.
  const [editing, setEditing] = useState<Class | "new" | null>(null);
  const [deleting, setDeleting] = useState<Class | null>(null);

  return (
    <PageShell>
      <PageShellHeader
        actions={
          <Button onClick={() => setEditing("new")} data-icon="inline-start">
            <Plus />
            New class
          </Button>
        }
      >
        <PageHeader
          eyebrow="Structure · Classes"
          title="Classes"
          description="Class groups within a program — a year and section (e.g. II-A). Attendance and marks are recorded against these."
        />
      </PageShellHeader>

      {isPending ? (
        <LoadingState label="Loading classes…" />
      ) : isError ? (
        <FormError>{errorMessage(error)}</FormError>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No classes yet"
          description="A class is a year and section within a program. Attendance and marks are recorded against these, so they come before either."
          action={
            <Button variant="outline" onClick={() => setEditing("new")} data-icon="inline-start">
              <Plus />
              Add the first class
            </Button>
          }
        />
      ) : (
        <Table containerClassName={TABLE_FRAME}>
            <TableHeader>
              <TableRow>
                <TableHead>Program</TableHead>
                <TableHead>Owned by</TableHead>
                <TableHead className="text-right">Year</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Class teacher</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.programLabel}</TableCell>
                  {/* The owning department — the scoping key, and the column that
                      shows a first year sitting with S&H while its award is CSE. */}
                  <TableCell className="text-sm">{c.departmentName}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.year}</TableCell>
                  <TableCell className="font-medium">{c.section}</TableCell>
                  <TableCell className="text-sm">
                    {c.advisorName ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.studentCount}
                  </TableCell>
                  <TableCell>
                    <ActiveBadge active={c.isActive} />
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
      )}

      {editing !== null && (
        <ClassFormDialog
          cls={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting !== null && <DeleteDialog cls={deleting} onClose={() => setDeleting(null)} />}
    </PageShell>
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
  // Only an empty class can be deleted — students enrolled in it would lose
  // their placement for the year.
  const canDelete = cls.studentCount === 0;

  return (
    <RowActionsMenu
      label={`Actions for ${cls.programLabel} ${cls.year}-${cls.section}`}
      actions={[
        { label: "Edit", icon: Pencil, onSelect: onEdit },
        {
          label: cls.isActive ? "Deactivate" : "Reactivate",
          icon: Power,
          disabled: update.isPending,
          onSelect: () => update.mutate({ id: cls.id, input: { isActive: !cls.isActive } }),
        },
        canDelete && { label: "Delete", icon: Trash2, destructive: true, onSelect: onDelete },
      ]}
    />
  );
}

// Create (cls = null) or edit an existing class. On create the Program is a
// dropdown that bounds the Year options and the owning department defaults to the
// one that runs that program; on edit both are fixed and only Year + Section (and
// the class teacher) are editable.
function ClassFormDialog({ cls, onClose }: { cls: Class | null; onClose: () => void }) {
  const isEdit = cls !== null;
  const create = useCreateClass();
  const update = useUpdateClass();

  const { data: programs } = usePrograms();
  const activePrograms = (programs ?? []).filter((p) => p.isActive);
  const staff = useStaffOptions();
  const departments = useDepartments();
  const activeDepartments = (departments.data ?? []).filter((d) => d.isActive);

  const [programId, setProgramId] = useState(cls?.programId ?? "");
  // "" = follow the program's own department. Picking one overrides that — the
  // control that hands a first year to S&H without touching its award.
  const [departmentId, setDepartmentId] = useState(cls?.departmentId ?? "");
  const [year, setYear] = useState(cls ? String(cls.year) : "");
  const [section, setSection] = useState(cls?.section ?? "");
  const [advisorId, setAdvisorId] = useState(cls?.advisorId ?? NO_ADVISOR);

  // The advisor must be staff of the department that OWNS the class — the "Owned
  // by" field above, not the award. That is what makes an S&H lecturer eligible to
  // be class teacher of a first-year class whose award is B.E · CSE.
  //
  // Resolved the same way the server does: an explicit owner wins, otherwise the
  // department that runs the selected program. On edit the class already has one.
  const ownerDepartmentId = isEdit
    ? (departmentId || cls.departmentId)
    : departmentId || (activePrograms.find((p) => p.id === programId)?.departmentId ?? "");
  const advisorOptions = (staff.data ?? []).filter((s) => s.departmentId === ownerDepartmentId);

  // The stored advisor is treated as a REQUEST, not the truth: handing the class
  // to another department can strand a pick that belonged to the old one. Deriving
  // the effective value (rather than resetting it in an effect) means the form can
  // never submit an advisor the owning department doesn't employ. The edit dialog
  // keeps the advisor already on the record even once staff have loaded, so opening
  // it never silently clears a class teacher nobody asked to change.
  const advisorStillValid =
    advisorId === NO_ADVISOR ||
    (isEdit && advisorId === cls.advisorId) ||
    advisorOptions.some((s) => s.userId === advisorId);
  const effectiveAdvisorId = advisorStillValid ? advisorId : NO_ADVISOR;

  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  // The selected program's degree duration bounds the Year options. On edit the
  // program is fixed but may not be in the list (e.g. deactivated), so fall back
  // to the class's own year for the dropdown bound.
  const selectedProgram = activePrograms.find((p) => p.id === programId);
  const durationYears = selectedProgram?.durationYears ?? (cls ? cls.year : 0);
  const yearOptions = Array.from({ length: durationYears }, (_, i) => i + 1);

  const yearNum = Number(year);
  // Section is free text; the same bounds the server applies (non-empty, ≤4 chars
  // after trimming). It's already upper-cased by the input's onChange.
  const trimmedSection = section.trim();
  const valid =
    programId !== "" &&
    Number.isInteger(yearNum) &&
    yearNum >= 1 &&
    trimmedSection !== "" &&
    trimmedSection.length <= 4;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const advisor = effectiveAdvisorId === NO_ADVISOR ? null : effectiveAdvisorId;
    if (isEdit) {
      update.mutate(
        { id: cls.id, input: { year: yearNum, section: trimmedSection, advisorId: advisor } },
        { onSuccess: onClose },
      );
    } else {
      // Send the owner only when it differs from the program's own department —
      // omitting it lets the server apply that default.
      create.mutate(
        {
          programId,
          departmentId: departmentId === "" ? undefined : departmentId,
          year: yearNum,
          section: trimmedSection,
          advisorId: advisor,
        },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit class" : "New class"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this class's year and section. The program and the department that owns it can't be changed."
              : "Add a class group within a program — pick the award, who owns the class, then its year and section."}
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
                  const next = (v as string) ?? "";
                  setProgramId(next);
                  // Reset year (duration bound changed) + advisor (staff are
                  // program-scoped, so the previous pick may no longer apply).
                  setYear("");
                  setAdvisorId(NO_ADVISOR);
                  // Default the owner to the department that runs the new program;
                  // the admin can still hand the class to another one.
                  setDepartmentId(activePrograms.find((p) => p.id === next)?.departmentId ?? "");
                }}
              >
                <SelectTrigger size="lg" id="class-program" className="w-full">
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="class-department">Owned by</Label>
            {isEdit ? (
              // The owner is fixed after create — show it read-only.
              <div className="flex h-10 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                {cls.departmentName}
              </div>
            ) : activeDepartments.length === 0 ? (
              // /api/departments is Super-Admin-only, so a HOD gets nothing here.
              // That's correct rather than broken: they can only create a class for
              // their own department anyway, and the server derives that from the
              // program. Show what will happen instead of an empty, dead control.
              <div className="flex h-10 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                The department that runs the selected program
              </div>
            ) : (
              <DepartmentSelect
                id="class-department"
                value={departmentId}
                onChange={setDepartmentId}
                departments={activeDepartments}
              />
            )}
            <p className="text-xs text-muted-foreground">
              The department this class belongs to day to day — its HOD and staff.
              Defaults to the department that runs the program. Change it to hand a
              first-year class to Science &amp; Humanities while its award stays
              B.E · CSE.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="class-year">Year</Label>
              <Select
                value={year}
                onValueChange={(v) => setYear((v as string) ?? "")}
                disabled={yearOptions.length === 0}
              >
                <SelectTrigger size="lg" id="class-year" className="w-full">
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
              {/* Free text rather than a fixed A–H list, so a college running
                  "P1" or more than eight sections isn't blocked. Upper-cased on
                  the way IN, not just on save: the field shows exactly what will
                  be stored, and (programId, year, section) is unique — "a" and
                  "A" must never be able to become two different sections. The
                  server upper-cases too, since the form isn't the only caller. */}
              <Input
                size="lg"
                id="class-section"
                value={section}
                onChange={(e) => setSection(e.target.value.toUpperCase())}
                placeholder="A"
                maxLength={4}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="uppercase"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="class-advisor">Class teacher</Label>
            <Select
              value={effectiveAdvisorId}
              onValueChange={(v) => setAdvisorId((v as string) ?? NO_ADVISOR)}
              disabled={ownerDepartmentId === ""}
            >
              <SelectTrigger size="lg" id="class-advisor" className="w-full">
                <SelectValue placeholder="Optional">
                  {(v) => {
                    if (v === NO_ADVISOR || !v) return "None";
                    // Fall back to the stored name if the advisor isn't in the
                    // active list (e.g. later deactivated).
                    if (isEdit && v === cls.advisorId && cls.advisorName) return cls.advisorName;
                    return advisorOptions.find((s) => s.userId === v)?.displayName ?? "None";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ADVISOR}>None</SelectItem>
                {advisorOptions.map((s) => (
                  <SelectItem key={s.userId} value={s.userId}>
                    {s.displayName}
                    {s.designation ? ` · ${s.designation}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ownerDepartmentId !== "" && !staff.isPending && advisorOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No staff in the owning department yet — add faculty to it first, then set the
                class teacher.
              </p>
            )}
          </div>

          {mutationError && (
            <FormError>{errorMessage(mutationError)}</FormError>
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
          <FormError>{errorMessage(del.error)}</FormError>
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
