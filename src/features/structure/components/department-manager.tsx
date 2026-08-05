// Department management — list + create/edit/deactivate/delete. Super-Admin only
// (the page gates with AuthGate requireRole; the API re-checks every call).
// Follows the Branch CRUD screen shape.
//
// A Department is the ORGANISATIONAL unit — it employs staff, has a HOD, owns
// classes and runs one or more programs. That makes it a different thing from a
// Branch, which is only the discipline named in an award ("B.E · CSE"). Two facts
// drive the whole screen:
//
//   - A department may run programs across SEVERAL branches (a Civil department
//     running B.E-CIVIL and B.E-STRUCT), so it can't be derived from a branch.
//   - A department may run NONE at all. Science & Humanities owns every branch's
//     first-year classes and employs the staff who teach them, but nobody
//     graduates in it — which is why "0 programs" is a valid, meaningful row here
//     rather than an incomplete one.
"use client";

import { useState } from "react";
import { Building2, Plus, Pencil, Power, Trash2 } from "lucide-react";

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
import type { Department } from "@/features/structure/types";
import {
  useCreateDepartment,
  useDeleteDepartment,
  useDepartments,
  useUpdateDepartment,
} from "@/features/structure/hooks/use-departments";

export function DepartmentManager() {
  const { data: departments, isPending, isError, error } = useDepartments();

  // null = closed; "new" = create; a Department = edit that row.
  const [editing, setEditing] = useState<Department | "new" | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);

  return (
    <PageShell>
      <PageShellHeader
        actions={
          <Button onClick={() => setEditing("new")} data-icon="inline-start">
            <Plus />
            New department
          </Button>
        }
      >
        <PageHeader
          eyebrow="Structure · Departments"
          title="Departments"
          description="The units that run the college — each has a HOD, employs staff and owns classes. A department may run several programs, or none at all (Science & Humanities teaches first year without awarding a degree)."
        />
      </PageShellHeader>

      {isPending ? (
        <LoadingState label="Loading departments…" />
      ) : isError ? (
        <FormError>{errorMessage(error)}</FormError>
      ) : departments.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No departments yet"
          description="A department employs staff and owns classes. It is the key everything else is scoped by, so add these before programs."
          action={
            <Button variant="outline" onClick={() => setEditing("new")} data-icon="inline-start">
              <Plus />
              Add the first department
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
                <TableHead className="text-right">Classes</TableHead>
                <TableHead className="text-right">Staff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.code}</TableCell>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {/* 0 is legitimate — a teaching-only department awards nothing. */}
                    {d.programCount === 0 ? (
                      <span title="Teaching-only — runs no degree of its own">—</span>
                    ) : (
                      d.programCount
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {d.classCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {d.facultyCount}
                  </TableCell>
                  <TableCell>
                    <ActiveBadge active={d.isActive} />
                  </TableCell>
                  <TableCell>
                    <RowActions
                      department={d}
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
        <DepartmentFormDialog
          department={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting !== null && (
        <DeleteDialog department={deleting} onClose={() => setDeleting(null)} />
      )}
    </PageShell>
  );
}

// Per-row actions. Deactivate/reactivate always available; hard delete only when
// the department owns NOTHING — no programs, no classes and no staff. The API
// returns 409 otherwise, so hiding the button makes that obvious up front.
function RowActions({
  department,
  onEdit,
  onDelete,
}: {
  department: Department;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateDepartment();
  const canDelete =
    department.programCount === 0 && department.classCount === 0 && department.facultyCount === 0;

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit department">
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={update.isPending}
        onClick={() => update.mutate({ id: department.id, input: { isActive: !department.isActive } })}
        aria-label={department.isActive ? "Deactivate department" : "Reactivate department"}
        title={department.isActive ? "Deactivate" : "Reactivate"}
      >
        <Power className={department.isActive ? "" : "text-muted-foreground"} />
      </Button>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="Delete department"
          title="Delete"
        >
          <Trash2 className="text-destructive" />
        </Button>
      )}
    </div>
  );
}

// Create (department = null) or edit an existing one. Same form either way.
function DepartmentFormDialog({
  department,
  onClose,
}: {
  department: Department | null;
  onClose: () => void;
}) {
  const isEdit = department !== null;
  const create = useCreateDepartment();
  const update = useUpdateDepartment();

  const [name, setName] = useState(department?.name ?? "");
  const [code, setCode] = useState(department?.code ?? "");

  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  const valid = name.trim() !== "" && code.trim() !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const input = { name: name.trim(), code: code.trim() };
    if (isEdit) {
      update.mutate({ id: department.id, input }, { onSuccess: onClose });
    } else {
      create.mutate(input, { onSuccess: onClose });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit department" : "New department"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this department. Its programs, classes and staff stay attached."
              : "Add a unit that employs staff and owns classes. Attach its programs afterwards — a department that runs none still teaches (Science & Humanities owns first year)."}
          </DialogDescription>
        </DialogHeader>

        <form id="department-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="department-name">Name</Label>
            <Input
              size="lg"
              id="department-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Computer Science and Engineering Department"
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="department-code">Code</Label>
            <Input
              size="lg"
              id="department-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CSE"
              required
            />
            <p className="text-xs text-muted-foreground">
              Short label shown in pickers and lists — e.g. CSE, S&amp;H.
            </p>
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
          <Button type="submit" form="department-form" disabled={!valid || pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create department"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ department, onClose }: { department: Department; onClose: () => void }) {
  const del = useDeleteDepartment();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{department.name}”?</DialogTitle>
          <DialogDescription>
            This permanently removes the department. It owns no programs, classes or staff, so
            nothing depends on it. To keep it for history instead, deactivate it.
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
            onClick={() => del.mutate(department.id, { onSuccess: onClose })}
          >
            {del.isPending ? "Deleting…" : "Delete department"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
