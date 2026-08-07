// Degree management — list + create/edit/deactivate/delete. Super-Admin only
// (the page gates with AuthGate requireRole; the API re-checks every call). This
// is the reference CRUD screen for the Structure slice; Branch/Program/Class
// follow the same shape.
"use client";

import { useState } from "react";
import { GraduationCap, Plus, Pencil, Power, Trash2 } from "lucide-react";

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
import { ActiveBadge } from "@/components/status-badge";
import { errorMessage } from "@/lib/errors";
import { PageHeader } from "@/app/(app)/page-header";
import { PageShell, PageShellHeader, TABLE_FRAME } from "@/app/(app)/page-shell";
import type { Degree } from "@/features/structure/types";
import {
  useCreateDegree,
  useDegrees,
  useDeleteDegree,
  useUpdateDegree,
} from "@/features/structure/hooks/use-degrees";

export function DegreeManager() {
  const { data: degrees, isPending, isError, error } = useDegrees();

  // null = closed; "new" = create; a Degree = edit that row.
  const [editing, setEditing] = useState<Degree | "new" | null>(null);
  const [deleting, setDeleting] = useState<Degree | null>(null);

  return (
    <PageShell>
      <PageShellHeader
        actions={
          <Button onClick={() => setEditing("new")} data-icon="inline-start">
            <Plus />
            New degree
          </Button>
        }
      >
        <PageHeader
          eyebrow="Structure · Degrees"
          title="Degrees"
          description="The programmes offered (B.E, B.Tech, MBA…). A degree's duration bounds every program's year and semester ranges."
        />
      </PageShellHeader>

      {isPending ? (
        <TableSkeleton rows={6} cols={6} label="Loading degrees…" />
      ) : isError ? (
        <FormError>{errorMessage(error)}</FormError>
      ) : degrees.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No degrees yet"
          description="A degree is the qualification a program awards — B.E, B.Tech, MBA. Everything else in Structure hangs off one."
          action={
            <Button variant="outline" onClick={() => setEditing("new")} data-icon="inline-start">
              <Plus />
              Add the first degree
            </Button>
          }
        />
      ) : (
        <Table containerClassName={TABLE_FRAME}>
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
                  <ActiveBadge active={d.isActive} />
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
    </PageShell>
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
  // Hard delete is offered only when nothing depends on the degree — the API
  // returns 409 otherwise, and hiding the item says so before the user tries.
  const canDelete = degree.programCount === 0;

  return (
    <RowActionsMenu
      label={`Actions for ${degree.code}`}
      actions={[
        { label: "Edit", icon: Pencil, onSelect: onEdit },
        {
          label: degree.isActive ? "Deactivate" : "Reactivate",
          icon: Power,
          disabled: update.isPending,
          onSelect: () =>
            update.mutate({ id: degree.id, input: { isActive: !degree.isActive } }),
        },
        // Still opens the confirm dialog; the menu only replaces the button.
        canDelete && { label: "Delete", icon: Trash2, destructive: true, onSelect: onDelete },
      ]}
    />
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
              size="lg"
              id="degree-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bachelor of Engineering"
              autoFocus
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="degree-code">Code</Label>
              <Input
                size="lg"
                id="degree-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="B.E"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="degree-duration">Duration (years)</Label>
              <Input
                size="lg"
                id="degree-duration"
                type="number"
                min={1}
                max={10}
                value={durationYears}
                onChange={(e) => setDurationYears(e.target.value)}
                required
              />
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
          <FormError>{errorMessage(del.error)}</FormError>
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
