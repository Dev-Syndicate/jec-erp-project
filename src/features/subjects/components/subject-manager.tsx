// Subject management — the per-program curriculum catalog. Super-Admin only (page
// gates with AuthGate; the API re-checks). Subjects are keyed by semesterNumber
// (1..2×durationYears); the create/edit forms derive that range from the chosen
// program. Delete is deactivate-primary, hard-delete guarded by dependents.
"use client";

import { useState } from "react";
import { BookOpen, Layers, Plus, Pencil, Power, Trash2, ChevronRight } from "lucide-react";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { FormError } from "@/components/form-error";
// Aliased: each manager keeps a local `RowActions` that owns its mutation hook
// and decides which items apply; this is the menu those items render into.
import { RowActions as RowActionsMenu } from "@/components/row-actions";
import { FormSelect } from "@/components/form-select";
import { ActiveBadge } from "@/components/status-badge";
import { PageShell, PageShellHeader, TableToolbar } from "@/app/(app)/page-shell";
import { errorMessage } from "@/lib/errors";
import { PageHeader } from "@/app/(app)/page-header";
import type { ProgramOption, Subject } from "@/features/subjects/types";
import {
  useCreateSubject,
  useDeleteSubject,
  useProgramOptions,
  useSubjects,
  useUpdateSubject,
} from "@/features/subjects/hooks/use-subjects";

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
    <PageShell>
      <PageShellHeader
        actions={
          <Button onClick={() => setEditing("new")} data-icon="inline-start">
            <Plus />
            New subject
          </Button>
        }
      >
        <PageHeader
          eyebrow="Curriculum · Subjects"
          title="Subjects"
          description="The per-program subject catalogue, grouped by curriculum semester. A class studies the subjects whose semester matches its year and the active Odd/Even term."
        />
      </PageShellHeader>

      {isPending ? (
        <TableSkeleton rows={6} cols={6} label="Loading subjects…" />
      ) : isError ? (
        <FormError>{errorMessage(error)}</FormError>
      ) : allPrograms.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No programs yet"
          description="A subject catalogue belongs to a program. Create one under Structure → Programs first."
        />
      ) : (
        <>
          <TableToolbar className="justify-start gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Degree</Label>
              <div className="w-full sm:w-48">
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
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Branch</Label>
              <div className="w-full sm:w-48">
                <FormSelect
                  value={activeBranchId}
                  onChange={setBranchFilter}
                  options={branchOptions}
                  placeholder="Select a branch"
                />
              </div>
            </div>
          </TableToolbar>

          {filtered.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No subjects in this program yet"
              description="Add the subjects this program teaches; they group themselves by curriculum semester."
              action={
                <Button variant="outline" onClick={() => setEditing("new")} data-icon="inline-start">
                  <Plus />
                  Add a subject
                </Button>
              }
            />
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
                            <ActiveBadge active={s.isActive} />
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
    </PageShell>
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
  // Dependents are timetable slots, marks and attendance rows — a subject with
  // any of those is history, so it deactivates rather than deletes.
  const canDelete = subject.dependentCount === 0;

  return (
    <RowActionsMenu
      label={`Actions for ${subject.code}`}
      actions={[
        { label: "Edit", icon: Pencil, onSelect: onEdit },
        {
          label: subject.isActive ? "Deactivate" : "Reactivate",
          icon: Power,
          disabled: update.isPending,
          onSelect: () => update.mutate({ id: subject.id, input: { isActive: !subject.isActive } }),
        },
        canDelete && { label: "Delete", icon: Trash2, destructive: true, onSelect: onDelete },
      ]}
    />
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
              <Input size="lg" value={subject.programLabel} disabled />
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
              <Input size="lg" id="subj-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS3401" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="subj-name">Name</Label>
              <Input size="lg" id="subj-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Algorithms" required />
            </div>
          </div>
          {mutationError && (
            <FormError>{errorMessage(mutationError)}</FormError>
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
          <FormError>{errorMessage(del.error)}</FormError>
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
