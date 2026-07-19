// Degree management — list + create/edit/deactivate/delete. Super-Admin only
// (the page gates with AuthGate requireRole; the API re-checks every call). This
// is the reference CRUD screen for the Structure slice; Branch/Program/Class
// follow the same shape.
"use client";

import { useState } from "react";
import { Plus, Pencil, Power, Trash2 } from "lucide-react";

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
import { PageHeader } from "@/app/(app)/page-header";
import type { Degree } from "@/features/structure/types";
import {
  useCreateDegree,
  useDegrees,
  useDeleteDegree,
  useUpdateDegree,
} from "@/features/structure/hooks/use-degrees";

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

export function DegreeManager() {
  const { data: degrees, isPending, isError, error } = useDegrees();

  // null = closed; "new" = create; a Degree = edit that row.
  const [editing, setEditing] = useState<Degree | "new" | null>(null);
  const [deleting, setDeleting] = useState<Degree | null>(null);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Structure · Degrees"
          title="Degrees"
          description="The programmes offered (B.E, B.Tech, MBA…). A degree's duration bounds every program's year and semester ranges."
        />
        <Button onClick={() => setEditing("new")} data-icon="inline-start">
          <Plus />
          New degree
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading degrees…</p>
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : degrees.length === 0 ? (
        <EmptyState onAdd={() => setEditing("new")} />
      ) : (
        <div className="rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Programs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {degrees.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.code}</TableCell>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.durationYears} {d.durationYears === 1 ? "year" : "years"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {d.programCount}
                  </TableCell>
                  <TableCell>
                    <StatusPill active={d.isActive} />
                  </TableCell>
                  <TableCell>
                    <RowActions
                      degree={d}
                      onEdit={() => setEditing(d)}
                      onDelete={() => setDeleting(d)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing !== null && (
        <DegreeFormDialog
          degree={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting !== null && (
        <DeleteDialog degree={deleting} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">No degrees yet.</p>
      <Button variant="outline" onClick={onAdd} data-icon="inline-start">
        <Plus />
        Add the first degree
      </Button>
    </div>
  );
}

// Per-row actions. Deactivate/reactivate always available; hard delete only when
// the degree has no programs (otherwise the API returns 409 — we hide it to make
// that obvious up front).
function RowActions({
  degree,
  onEdit,
  onDelete,
}: {
  degree: Degree;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateDegree();
  const canDelete = degree.programCount === 0;

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit degree">
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={update.isPending}
        onClick={() => update.mutate({ id: degree.id, input: { isActive: !degree.isActive } })}
        aria-label={degree.isActive ? "Deactivate degree" : "Reactivate degree"}
        title={degree.isActive ? "Deactivate" : "Reactivate"}
      >
        <Power className={degree.isActive ? "" : "text-muted-foreground"} />
      </Button>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete degree"
          title="Delete"
        >
          <Trash2 className="text-destructive" />
        </Button>
      )}
    </div>
  );
}

// Create (degree = null) or edit an existing degree. Same form either way.
function DegreeFormDialog({ degree, onClose }: { degree: Degree | null; onClose: () => void }) {
  const isEdit = degree !== null;
  const create = useCreateDegree();
  const update = useUpdateDegree();

  const [name, setName] = useState(degree?.name ?? "");
  const [code, setCode] = useState(degree?.code ?? "");
  const [durationYears, setDurationYears] = useState(String(degree?.durationYears ?? 4));

  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  const years = Number(durationYears);
  const valid = name.trim() !== "" && code.trim() !== "" && Number.isInteger(years) && years >= 1;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const input = { name: name.trim(), code: code.trim(), durationYears: years };
    if (isEdit) {
      update.mutate({ id: degree.id, input }, { onSuccess: onClose });
    } else {
      create.mutate(input, { onSuccess: onClose });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit degree" : "New degree"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this degree. Changing the duration affects the year and semester ranges of its programs."
              : "Add a degree offered by the college. Its duration sets how many years its programs run."}
          </DialogDescription>
        </DialogHeader>

        <form id="degree-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="degree-name">Name</Label>
            <Input
              id="degree-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bachelor of Engineering"
              className="h-10!"
              autoFocus
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="degree-code">Code</Label>
              <Input
                id="degree-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="B.E"
                className="h-10!"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="degree-duration">Duration (years)</Label>
              <Input
                id="degree-duration"
                type="number"
                min={1}
                max={10}
                value={durationYears}
                onChange={(e) => setDurationYears(e.target.value)}
                className="h-10!"
                required
              />
            </div>
          </div>
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
          <Button type="submit" form="degree-form" disabled={!valid || pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create degree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ degree, onClose }: { degree: Degree; onClose: () => void }) {
  const del = useDeleteDegree();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{degree.name}”?</DialogTitle>
          <DialogDescription>
            This permanently removes the degree. It has no programs, so nothing depends on it. To
            keep it for history instead, deactivate it.
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
            onClick={() => del.mutate(degree.id, { onSuccess: onClose })}
          >
            {del.isPending ? "Deleting…" : "Delete degree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
