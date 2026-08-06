// Program management — list + create/deactivate/delete. Super-Admin only (the page
// gates with AuthGate requireRole; the API re-checks every call). A Program is a
// Degree × Branch pairing (e.g. B.E × CSE) — it has no name/code of its own, so
// there's no edit dialog: the only mutable field is isActive (the row toggle).
"use client";

import { useState } from "react";
import { Layers, Plus, Power, Trash2 } from "lucide-react";

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
import type { Program } from "@/features/structure/types";
import {
  useCreateProgram,
  useDeleteProgram,
  usePrograms,
  useUpdateProgram,
} from "@/features/structure/hooks/use-programs";
import { useDegrees } from "@/features/structure/hooks/use-degrees";
import { useBranches } from "@/features/structure/hooks/use-branches";
import { useDepartments } from "@/features/structure/hooks/use-departments";
import { DepartmentSelect } from "@/components/department-select";

export function ProgramManager() {
  const { data: programs, isPending, isError, error } = usePrograms();

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Program | null>(null);

  return (
    <PageShell>
      <PageShellHeader
        actions={
          <Button onClick={() => setCreating(true)} data-icon="inline-start">
            <Plus />
            New program
          </Button>
        }
      >
        <PageHeader
          eyebrow="Structure · Programs"
          title="Programs"
          description="A program is a degree paired with a branch (e.g. B.E × CSE) — the scoping key every class, student and subject belongs to."
        />
      </PageShellHeader>

      {isPending ? (
        <LoadingState label="Loading programs…" />
      ) : isError ? (
        <FormError>{errorMessage(error)}</FormError>
      ) : programs.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No programs yet"
          description="A program pairs a degree with a branch and names the department that runs it. Add degrees, branches and departments first."
          action={
            <Button variant="outline" onClick={() => setCreating(true)} data-icon="inline-start">
              <Plus />
              Add the first program
            </Button>
          }
        />
      ) : (
        <Table containerClassName={TABLE_FRAME}>
            <TableHeader>
              <TableRow>
                <TableHead>Program</TableHead>
                <TableHead>Degree</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Run by</TableHead>
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
                  {/* The department that runs the award — often the same code as
                      the branch, but a separate thing and not always a match. */}
                  <TableCell className="text-sm">{p.departmentName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.durationYears} {p.durationYears === 1 ? "year" : "years"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {p.classCount}
                  </TableCell>
                  <TableCell>
                    <ActiveBadge active={p.isActive} />
                  </TableCell>
                  <TableCell>
                    <RowActions program={p} onDelete={() => setDeleting(p)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
        </Table>
      )}

      {creating && <ProgramFormDialog onClose={() => setCreating(false)} />}
      {deleting !== null && (
        <DeleteDialog program={deleting} onClose={() => setDeleting(null)} />
      )}
    </PageShell>
  );
}

// Per-row actions. Deactivate/reactivate always available; hard delete only when
// the program has no classes (otherwise the API returns 409 — we hide it to make
// that obvious up front).
function RowActions({ program, onDelete }: { program: Program; onDelete: () => void }) {
  const update = useUpdateProgram();
  const canDelete = program.classCount === 0;

  // No Edit item: a program IS its Degree × Branch pairing, so there is nothing
  // editable — changing either half makes it a different program. Delete and
  // recreate is the intended path, which is why only two items appear here.
  return (
    <RowActionsMenu
      label={`Actions for ${program.degreeCode} · ${program.branchCode}`}
      actions={[
        {
          label: program.isActive ? "Deactivate" : "Reactivate",
          icon: Power,
          disabled: update.isPending,
          onSelect: () => update.mutate({ id: program.id, isActive: !program.isActive }),
        },
        canDelete && { label: "Delete", icon: Trash2, destructive: true, onSelect: onDelete },
      ]}
    />
  );
}

// Create a program — pick a degree and a branch (the pairing IS the program), plus
// the department that runs it. All three dropdowns show only active options. Base
// UI's Select needs a value → label render fn on Select.Value, else it renders the
// raw cuid.
function ProgramFormDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateProgram();
  const degrees = useDegrees();
  const branches = useBranches();
  const departments = useDepartments();

  const [degreeId, setDegreeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const activeDegrees = (degrees.data ?? []).filter((d) => d.isActive);
  const activeBranches = (branches.data ?? []).filter((b) => b.isActive);
  const activeDepartments = (departments.data ?? []).filter((d) => d.isActive);

  const degreeLabel = (id: unknown) => {
    const d = activeDegrees.find((x) => x.id === id);
    return d ? `${d.name} (${d.code})` : "Select a degree";
  };
  const branchLabel = (id: unknown) => {
    const b = activeBranches.find((x) => x.id === id);
    return b ? `${b.name} (${b.code})` : "Select a branch";
  };

  const valid = degreeId !== "" && branchId !== "" && departmentId !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    create.mutate({ degreeId, branchId, departmentId }, { onSuccess: onClose });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New program</DialogTitle>
          <DialogDescription>
            Pair a degree with a branch (e.g. B.E × CSE), then say which department
            runs it. Each pairing is unique and becomes the scoping key its classes,
            students and subjects belong to.
          </DialogDescription>
        </DialogHeader>

        <form id="program-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="program-degree">Degree</Label>
            <Select value={degreeId} onValueChange={(v) => setDegreeId((v as string) ?? "")}>
              <SelectTrigger size="lg" id="program-degree" className="w-full">
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
              <SelectTrigger size="lg" id="program-branch" className="w-full">
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="program-department">Run by</Label>
            <DepartmentSelect
              id="program-department"
              value={departmentId}
              onChange={setDepartmentId}
              departments={activeDepartments}
            />
            <p className="text-xs text-muted-foreground">
              The department that runs this award and employs its staff. One
              department can run several — the branch is only the name in the award.
            </p>
          </div>
          {create.error && (
            <FormError>{errorMessage(create.error)}</FormError>
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
          <FormError>{errorMessage(del.error)}</FormError>
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
