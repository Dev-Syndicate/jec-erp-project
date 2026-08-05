// Branch management — list + create/edit/deactivate/delete. Super-Admin only
// (the page gates with AuthGate requireRole; the API re-checks every call). Follows
// the Degree CRUD screen shape (the reference for the Structure slice), minus
// durationYears — a Branch is a bare discipline.
"use client";

import { useState } from "react";
import { Network, Plus, Pencil, Power, Trash2 } from "lucide-react";

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
import { FormError } from "@/components/form-error";
import { LoadingState } from "@/components/loading-state";
import { ActiveBadge } from "@/components/status-badge";
import { errorMessage } from "@/lib/errors";
import { PageHeader } from "@/app/(app)/page-header";
import { PageShell, PageShellHeader, TABLE_FRAME } from "@/app/(app)/page-shell";
import type { Branch } from "@/features/structure/types";
import {
  useCreateBranch,
  useBranches,
  useDeleteBranch,
  useUpdateBranch,
} from "@/features/structure/hooks/use-branches";

export function BranchManager() {
  const { data: branches, isPending, isError, error } = useBranches();

  // null = closed; "new" = create; a Branch = edit that row.
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [deleting, setDeleting] = useState<Branch | null>(null);

  return (
    <PageShell>
      <PageShellHeader
        actions={
          <Button onClick={() => setEditing("new")} data-icon="inline-start">
            <Plus />
            New branch
          </Button>
        }
      >
        <PageHeader
          eyebrow="Structure · Branches"
          title="Branches"
          description="The disciplines offered (CSE, ECE, MECH…). A branch pairs with a degree to form a program."
        />
      </PageShellHeader>

      {isPending ? (
        <LoadingState label="Loading branches…" />
      ) : isError ? (
        <FormError>{errorMessage(error)}</FormError>
      ) : branches.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No branches yet"
          description="A branch is the discipline half of an award — CSE, ECE, MECH. Pair one with a degree to make a program."
          action={
            <Button variant="outline" onClick={() => setEditing("new")} data-icon="inline-start">
              <Plus />
              Add the first branch
            </Button>
          }
        />
      ) : (
        <Table containerClassName={TABLE_FRAME}>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Programs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-0 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-xs">{d.code}</TableCell>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {d.programCount}
                </TableCell>
                <TableCell>
                  <ActiveBadge active={d.isActive} />
                </TableCell>
                <TableCell>
                  <RowActions
                    branch={d}
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
        <BranchFormDialog
          branch={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting !== null && (
        <DeleteDialog branch={deleting} onClose={() => setDeleting(null)} />
      )}
    </PageShell>
  );
}

// Per-row actions. Deactivate/reactivate always available; hard delete only when
// the branch has no programs (otherwise the API returns 409 — we hide it to make
// that obvious up front).
function RowActions({
  branch,
  onEdit,
  onDelete,
}: {
  branch: Branch;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateBranch();
  const canDelete = branch.programCount === 0;

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit branch">
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={update.isPending}
        onClick={() => update.mutate({ id: branch.id, input: { isActive: !branch.isActive } })}
        aria-label={branch.isActive ? "Deactivate branch" : "Reactivate branch"}
        title={branch.isActive ? "Deactivate" : "Reactivate"}
      >
        <Power className={branch.isActive ? "" : "text-muted-foreground"} />
      </Button>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete branch"
          title="Delete"
        >
          <Trash2 className="text-destructive" />
        </Button>
      )}
    </div>
  );
}

// Create (branch = null) or edit an existing branch. Same form either way.
function BranchFormDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const isEdit = branch !== null;
  const create = useCreateBranch();
  const update = useUpdateBranch();

  const [name, setName] = useState(branch?.name ?? "");
  const [code, setCode] = useState(branch?.code ?? "");

  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  const valid = name.trim() !== "" && code.trim() !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const input = { name: name.trim(), code: code.trim() };
    if (isEdit) {
      update.mutate({ id: branch.id, input }, { onSuccess: onClose });
    } else {
      create.mutate(input, { onSuccess: onClose });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit branch" : "New branch"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this branch. It pairs with a degree to form a program."
              : "Add a discipline offered by the college. It pairs with a degree to form a program."}
          </DialogDescription>
        </DialogHeader>

        <form id="branch-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="branch-name">Name</Label>
            <Input
              size="lg"
              id="branch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Computer Science and Engineering"
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="branch-code">Code</Label>
            <Input
              size="lg"
              id="branch-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CSE"
              required
            />
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
          <Button type="submit" form="branch-form" disabled={!valid || pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create branch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const del = useDeleteBranch();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{branch.name}”?</DialogTitle>
          <DialogDescription>
            This permanently removes the branch. It has no programs, so nothing depends on it. To
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
            onClick={() => del.mutate(branch.id, { onSuccess: onClose })}
          >
            {del.isPending ? "Deleting…" : "Delete branch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
