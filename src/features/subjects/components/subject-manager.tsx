// Subject management — the per-program curriculum catalog. Super-Admin only (page
// gates with AuthGate; the API re-checks). Subjects are keyed by semesterNumber
// (1..2×durationYears); the create/edit forms derive that range from the chosen
// program. Delete is deactivate-primary, hard-delete guarded by dependents.
"use client";

import { useState } from "react";
import { Plus, Pencil, Power, Trash2, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/app/(app)/page-header";
import type { ProgramOption, Subject } from "@/features/subjects/types";
import {
  useCreateSubject,
  useDeleteSubject,
  useProgramOptions,
  useSubjects,
  useUpdateSubject,
} from "@/features/subjects/hooks/use-subjects";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}

const kindLabel = (k: "ODD" | "EVEN") => (k === "ODD" ? "Odd" : "Even");

// Group subjects by curriculum semester (ascending) so the list reads as a few
// scannable blocks instead of one long table. year/kind are shared per semester.
function groupBySemester(
  subjects: Subject[],
): Array<{ semesterNumber: number; year: number; kind: "ODD" | "EVEN"; items: Subject[] }> {
  const map = new Map<number, Subject[]>();
  for (const s of subjects) {
    const arr = map.get(s.semesterNumber);
    if (arr) arr.push(s);
    else map.set(s.semesterNumber, [s]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([semesterNumber, items]) => ({
      semesterNumber,
      year: items[0].year,
      kind: items[0].kind,
      items,
    }));
}

// The semesterNumber options for a program of the given duration:
// 1..2×durationYears, each labelled with its derived year + Odd/Even.
function semesterOptions(durationYears: number): Array<{ value: string; label: string }> {
  const max = durationYears * 2;
  return Array.from({ length: max }, (_, i) => {
    const n = i + 1;
    const year = Math.ceil(n / 2);
    const kind = n % 2 === 1 ? "Odd" : "Even";
    return { value: String(n), label: `Semester ${n} — Year ${year}, ${kind}` };
  });
}

// Base UI Select that renders the option label (not the raw value) — the
// department-select.tsx pattern. Local to the feature (no cross-feature imports).
function FormSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  disabled?: boolean;
}) {
  const label = (v: unknown) => options.find((o) => o.value === v)?.label ?? placeholder;
  return (
    <Select value={value} onValueChange={(v) => onChange((v as string) ?? "")} disabled={disabled}>
      <SelectTrigger id={id} className="h-10! w-full">
        <SelectValue placeholder={placeholder}>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider ${
        active ? "bg-status-present/10 text-status-present" : "bg-muted text-muted-foreground"
      }`}
    >
      <span className={`size-1.5 rounded-full ${active ? "bg-status-present" : "bg-muted-foreground"}`} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function SubjectManager() {
  const { data: subjects, isPending, isError, error } = useSubjects();
  const programs = useProgramOptions();
  const [degreeFilter, setDegreeFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [editing, setEditing] = useState<Subject | "new" | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);

  const allPrograms = programs.data ?? [];

  // A subject catalogue is per-program, and a program is a Degree × Branch — so
  // narrow with a Degree → Branch cascade (scales better than one flat program
  // list). Everything is DERIVED during render (default to the first degree/branch)
  // so there's no setState-in-effect.
  const degreeOptions = [
    ...new Map(allPrograms.map((p) => [p.degreeId, p.degreeLabel])).entries(),
  ].map(([value, label]) => ({ value, label }));

  const activeDegreeId = degreeFilter || degreeOptions[0]?.value || "";

  const branchOptions = allPrograms
    .filter((p) => p.degreeId === activeDegreeId)
    .map((p) => ({ value: p.branchId, label: p.branchLabel }));

  // Keep the chosen branch only if it belongs to the active degree; else first.
  const activeBranchId =
    branchOptions.find((b) => b.value === branchFilter)?.value ?? branchOptions[0]?.value ?? "";

  const activeProgram = allPrograms.find(
    (p) => p.degreeId === activeDegreeId && p.branchId === activeBranchId,
  );

  const filtered = (subjects ?? []).filter((s) => s.programId === activeProgram?.id);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Curriculum · Subjects"
          title="Subjects"
          description="The per-program subject catalogue, grouped by curriculum semester. A class studies the subjects whose semester matches its year and the active Odd/Even term."
        />
        <Button onClick={() => setEditing("new")} data-icon="inline-start">
          <Plus />
          New subject
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading subjects…</p>
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : allPrograms.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No programs yet.</p>
          <p className="text-xs text-muted-foreground">
            Create a program under Structure → Programs before adding subjects.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Degree</span>
              <div className="w-48">
                <FormSelect
                  value={activeDegreeId}
                  onChange={(v) => {
                    setDegreeFilter(v);
                    setBranchFilter(""); // branches differ per degree — reset
                  }}
                  options={degreeOptions}
                  placeholder="Select a degree"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Branch</span>
              <div className="w-48">
                <FormSelect
                  value={activeBranchId}
                  onChange={setBranchFilter}
                  options={branchOptions}
                  placeholder="Select a branch"
                />
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
              <p className="text-sm text-muted-foreground">No subjects in this program yet.</p>
              <Button variant="outline" onClick={() => setEditing("new")} data-icon="inline-start">
                <Plus />
                Add a subject
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groupBySemester(filtered).map((g) => (
                <details
                  key={g.semesterNumber}
                  open
                  className="group overflow-hidden rounded-xl ring-1 ring-foreground/10"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/40 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
                    <span className="font-heading text-sm font-semibold text-foreground">
                      Semester {g.semesterNumber}
                    </span>
                    <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                      Year {g.year} · {kindLabel(g.kind)}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {g.items.length} subject{g.items.length === 1 ? "" : "s"}
                    </span>
                  </summary>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-0 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.items.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">{s.code}</TableCell>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-muted-foreground">{s.programLabel}</TableCell>
                          <TableCell>
                            <StatusPill active={s.isActive} />
                          </TableCell>
                          <TableCell>
                            <RowActions
                              subject={s}
                              onEdit={() => setEditing(s)}
                              onDelete={() => setDeleting(s)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </details>
              ))}
            </div>
          )}
        </>
      )}

      {editing !== null && (
        <SubjectFormDialog
          subject={editing === "new" ? null : editing}
          programs={programs.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting !== null && <DeleteDialog subject={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function RowActions({
  subject,
  onEdit,
  onDelete,
}: {
  subject: Subject;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateSubject();
  const canDelete = subject.dependentCount === 0;
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit subject">
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={update.isPending}
        onClick={() => update.mutate({ id: subject.id, input: { isActive: !subject.isActive } })}
        aria-label={subject.isActive ? "Deactivate subject" : "Reactivate subject"}
        title={subject.isActive ? "Deactivate" : "Reactivate"}
      >
        <Power className={subject.isActive ? "" : "text-muted-foreground"} />
      </Button>
      {canDelete && (
        <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete subject" title="Delete">
          <Trash2 className="text-destructive" />
        </Button>
      )}
    </div>
  );
}

function SubjectFormDialog({
  subject,
  programs,
  onClose,
}: {
  subject: Subject | null;
  programs: ProgramOption[];
  onClose: () => void;
}) {
  const isEdit = subject !== null;
  const create = useCreateSubject();
  const update = useUpdateSubject();

  const [programId, setProgramId] = useState(subject?.programId ?? "");
  const [semesterNumber, setSemesterNumber] = useState(
    subject ? String(subject.semesterNumber) : "",
  );
  const [name, setName] = useState(subject?.name ?? "");
  const [code, setCode] = useState(subject?.code ?? "");

  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  // Semester options come from the selected program's duration.
  const selectedProgram = programs.find((p) => p.id === programId);
  const semOptions = selectedProgram ? semesterOptions(selectedProgram.durationYears) : [];

  const valid = programId !== "" && semesterNumber !== "" && name.trim() !== "" && code.trim() !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const semNum = Number(semesterNumber);
    if (isEdit) {
      update.mutate(
        { id: subject.id, input: { name: name.trim(), code: code.trim(), semesterNumber: semNum } },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(
        { programId, name: name.trim(), code: code.trim(), semesterNumber: semNum },
        { onSuccess: onClose },
      );
    }
  }

  const activePrograms = programs.filter((p) => p.isActive || p.id === programId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit subject" : "New subject"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this subject. Its program can't be changed here."
              : "Add a subject to a program's curriculum. The semester sets which year and term studies it."}
          </DialogDescription>
        </DialogHeader>
        <form id="subject-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="subj-program">Program</Label>
            {isEdit ? (
              <Input value={subject.programLabel} disabled className="h-10!" />
            ) : (
              <FormSelect
                id="subj-program"
                value={programId}
                onChange={(v) => {
                  setProgramId(v);
                  setSemesterNumber(""); // reset — options depend on the program
                }}
                options={activePrograms.map((p) => ({ value: p.id, label: p.label }))}
                placeholder="Select a program"
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="subj-sem">Semester</Label>
            <FormSelect
              id="subj-sem"
              value={semesterNumber}
              onChange={setSemesterNumber}
              options={semOptions}
              placeholder={programId === "" ? "Pick a program first" : "Select a semester"}
              disabled={programId === ""}
            />
          </div>
          <div className="grid grid-cols-[1fr_2fr] gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="subj-code">Code</Label>
              <Input id="subj-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS3401" className="h-10!" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="subj-name">Name</Label>
              <Input id="subj-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Algorithms" className="h-10!" required />
            </div>
          </div>
          {mutationError && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage(mutationError)}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="subject-form" disabled={!valid || pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create subject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const del = useDeleteSubject();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{subject.name}”?</DialogTitle>
          <DialogDescription>
            This permanently removes the subject. It isn’t used anywhere yet. To keep it for history
            instead, deactivate it.
          </DialogDescription>
        </DialogHeader>
        {del.isError && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
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
            onClick={() => del.mutate(subject.id, { onSuccess: onClose })}
          >
            {del.isPending ? "Deleting…" : "Delete subject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
