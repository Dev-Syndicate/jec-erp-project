// Program management — list + create/deactivate/delete. Super-Admin only (the page
// gates with AuthGate requireRole; the API re-checks every call). A Program is a
// Degree × Branch pairing (e.g. B.E × CSE) — it has no name/code of its own, so
// there's no edit dialog: the only mutable field is isActive (the row toggle).
"use client";

import { useState } from "react";
import { Plus, Power, Trash2 } from "lucide-react";

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
import type { Program } from "@/features/structure/types";
import {
  useCreateProgram,
  useDeleteProgram,
  usePrograms,
  useUpdateProgram,
} from "@/features/structure/hooks/use-programs";
import { useDegrees } from "@/features/structure/hooks/use-degrees";
import { useBranches } from "@/features/structure/hooks/use-branches";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}

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

export function ProgramManager() {
  const { data: programs, isPending, isError, error } = usePrograms();

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Program | null>(null);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Structure · Programs"
          title="Programs"
          description="A program is a degree paired with a branch (e.g. B.E × CSE) — the scoping key every class, student and subject belongs to."
        />
        <Button onClick={() => setCreating(true)} data-icon="inline-start">
          <Plus />
          New program
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading programs…</p>
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : programs.length === 0 ? (
        <EmptyState onAdd={() => setCreating(true)} />
      ) : (
        <div className="rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Program</TableHead>
                <TableHead>Degree</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Classes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programs.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    {p.degreeCode} · {p.branchCode}
                  </TableCell>
                  <TableCell className="font-medium">{p.degreeName}</TableCell>
                  <TableCell>{p.branchName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.durationYears} {p.durationYears === 1 ? "year" : "years"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {p.classCount}
                  </TableCell>
                  <TableCell>
                    <StatusPill active={p.isActive} />
                  </TableCell>
                  <TableCell>
                    <RowActions program={p} onDelete={() => setDeleting(p)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {creating && <ProgramFormDialog onClose={() => setCreating(false)} />}
      {deleting !== null && (
        <DeleteDialog program={deleting} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">No programs yet.</p>
      <Button variant="outline" onClick={onAdd} data-icon="inline-start">
        <Plus />
        Add the first program
      </Button>
    </div>
  );
}

// Per-row actions. Deactivate/reactivate always available; hard delete only when
// the program has no classes (otherwise the API returns 409 — we hide it to make
// that obvious up front).
function RowActions({ program, onDelete }: { program: Program; onDelete: () => void }) {
  const update = useUpdateProgram();
  const canDelete = program.classCount === 0;

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={update.isPending}
        onClick={() => update.mutate({ id: program.id, isActive: !program.isActive })}
        aria-label={program.isActive ? "Deactivate program" : "Reactivate program"}
        title={program.isActive ? "Deactivate" : "Reactivate"}
      >
        <Power className={program.isActive ? "" : "text-muted-foreground"} />
      </Button>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete program"
          title="Delete"
        >
          <Trash2 className="text-destructive" />
        </Button>
      )}
    </div>
  );
}

// Create a program — pick a degree and a branch (the only two inputs; the pairing
// IS the program). Both dropdowns show only active options. Base UI's Select needs
// a value → label render fn on Select.Value, else it renders the raw cuid.
function ProgramFormDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateProgram();
  const degrees = useDegrees();
  const branches = useBranches();

  const [degreeId, setDegreeId] = useState("");
  const [branchId, setBranchId] = useState("");

  const activeDegrees = (degrees.data ?? []).filter((d) => d.isActive);
  const activeBranches = (branches.data ?? []).filter((b) => b.isActive);

  const degreeLabel = (id: unknown) => {
    const d = activeDegrees.find((x) => x.id === id);
    return d ? `${d.name} (${d.code})` : "Select a degree";
  };
  const branchLabel = (id: unknown) => {
    const b = activeBranches.find((x) => x.id === id);
    return b ? `${b.name} (${b.code})` : "Select a branch";
  };

  const valid = degreeId !== "" && branchId !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    create.mutate({ degreeId, branchId }, { onSuccess: onClose });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New program</DialogTitle>
          <DialogDescription>
            Pair a degree with a branch (e.g. B.E × CSE). Each pairing is unique and
            becomes the scoping key its classes, students and subjects belong to.
          </DialogDescription>
        </DialogHeader>

        <form id="program-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="program-degree">Degree</Label>
            <Select value={degreeId} onValueChange={(v) => setDegreeId((v as string) ?? "")}>
              <SelectTrigger id="program-degree" className="h-10! w-full">
                <SelectValue placeholder="Select a degree">{degreeLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {activeDegrees.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="program-branch">Branch</Label>
            <Select value={branchId} onValueChange={(v) => setBranchId((v as string) ?? "")}>
              <SelectTrigger id="program-branch" className="h-10! w-full">
                <SelectValue placeholder="Select a branch">{branchLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {activeBranches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {create.error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage(create.error)}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="program-form" disabled={!valid || create.isPending}>
            {create.isPending ? "Saving…" : "Create program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ program, onClose }: { program: Program; onClose: () => void }) {
  const del = useDeleteProgram();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete “{program.degreeCode} · {program.branchCode}”?
          </DialogTitle>
          <DialogDescription>
            This permanently removes the program. It has no classes, users or subjects,
            so nothing depends on it. To keep it for history instead, deactivate it.
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
            onClick={() => del.mutate(program.id, { onSuccess: onClose })}
          >
            {del.isPending ? "Deleting…" : "Delete program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
