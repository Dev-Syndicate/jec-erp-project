// Access control — the RBAC admin console. List roles, compose them from the
// permission catalog (action × subject), and manage custom roles. System roles
// (Super Admin / HOD / Faculty / Student) are seeded: Super Admin is locked,
// the others can have their permissions edited but not their name/scope.
// Super-Admin only (the page gates; the API re-checks).
"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Lock, ShieldCheck } from "lucide-react";

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
import { PageHeader } from "@/app/(app)/page-header";
import { FormSelect } from "@/features/access/components/form-select";
import type { Permission, Role, Scope } from "@/features/access/types";
import {
  useCreateRole,
  useDeleteRole,
  usePermissions,
  useRoles,
  useUpdateRole,
} from "@/features/access/hooks/use-access";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}

const SCOPE_OPTIONS = [
  { value: "PROGRAM", label: "Program — own program only" },
  { value: "INSTITUTION", label: "Institution — all programs" },
];
const scopeLabel = (s: Scope) => (s === "INSTITUTION" ? "Institution" : "Program");
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      {children}
    </p>
  );
}

export function AccessManager() {
  const roles = useRoles();
  const permissions = usePermissions();
  const [editing, setEditing] = useState<Role | null | "new">(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const permById = useMemo(
    () => new Map((permissions.data ?? []).map((p) => [p.id, p])),
    [permissions.data],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Access · Roles & permissions"
          title="Access control"
          description="Compose roles from the permission catalogue and assign them to people. Roles are configurable data — new ones appear in the account role pickers automatically."
        />
        <Button onClick={() => setEditing("new")} data-icon="inline-start">
          <Plus />
          Add role
        </Button>
      </div>

      {/* Enforcement is still the requireRole stopgap; permissions edited here go
          live when the CASL swap lands. Set expectations so this isn't mistaken
          for an active gate yet. */}
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Roles and their permissions are managed here now. App-wide enforcement switches to these
        permissions (CASL) in a follow-up — until then, access still follows the built-in role rules.
      </p>

      {roles.isPending || permissions.isPending ? (
        <p className="text-sm text-muted-foreground">Loading roles…</p>
      ) : roles.isError ? (
        <FormError>{errorMessage(roles.error)}</FormError>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(roles.data ?? []).map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              permById={permById}
              onEdit={() => setEditing(role)}
              onDelete={() => setDeleting(role)}
            />
          ))}
        </div>
      )}

      {editing && (
        <RoleEditorDialog
          role={editing === "new" ? null : editing}
          permissions={permissions.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && <DeleteRoleDialog role={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function RoleCard({
  role,
  permById,
  onEdit,
  onDelete,
}: {
  role: Role;
  permById: Map<string, Permission>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isSuperAdmin = role.name === "Super Admin";
  const summary = isSuperAdmin
    ? "Full access to everything"
    : role.permissionIds
        .map((id) => permById.get(id))
        .filter(Boolean)
        .map((p) => `${titleCase(p!.action)} ${p!.subject}`)
        .sort()
        .join(" · ") || "No permissions yet";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-heading text-sm font-semibold text-foreground">{role.name}</span>
            {role.isSystem && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                {isSuperAdmin ? <Lock className="size-3" /> : <ShieldCheck className="size-3" />}
                System
              </span>
            )}
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-primary">
              {scopeLabel(role.scope)}
            </span>
          </div>
          {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
        </div>
        <div className="flex items-center gap-1">
          {!isSuperAdmin && (
            <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${role.name}`}>
              <Pencil />
            </Button>
          )}
          {!role.isSystem && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              aria-label={`Delete ${role.name}`}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{summary}</p>

      <div className="mt-auto flex items-center gap-3 border-t border-border pt-2 text-[0.7rem] text-muted-foreground">
        <span>{isSuperAdmin ? "All permissions" : `${role.permissionIds.length} permissions`}</span>
        <span>·</span>
        <span>
          {role.userCount} {role.userCount === 1 ? "user" : "users"}
        </span>
      </div>
    </div>
  );
}

function RoleEditorDialog({
  role,
  permissions,
  onClose,
}: {
  role: Role | null;
  permissions: Permission[];
  onClose: () => void;
}) {
  const create = useCreateRole();
  const update = useUpdateRole();
  const isEdit = !!role;
  const isSystem = role?.isSystem ?? false;

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [scope, setScope] = useState<Scope>(role?.scope ?? "PROGRAM");
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissionIds ?? []));

  // Permission catalogue grouped by subject for the checklist.
  const bySubject = useMemo(() => {
    const m = new Map<string, Permission[]>();
    for (const p of permissions) {
      const list = m.get(p.subject) ?? [];
      list.push(p);
      m.set(p.subject, list);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;
  const valid = name.trim() !== "";

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const permissionIds = [...selected];
    if (isEdit && role) {
      update.mutate(
        { id: role.id, patch: { name: name.trim(), description: description.trim() || null, scope, permissionIds } },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(
        { name: name.trim(), description: description.trim() || null, scope, permissionIds },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${role?.name}` : "Add role"}</DialogTitle>
          <DialogDescription>
            {isSystem
              ? "This is a system role — its name and scope are fixed, but you can tune its permissions."
              : "Name the role, choose where it acts, and tick the permissions it grants."}
          </DialogDescription>
        </DialogHeader>

        <form id="role-form" onSubmit={save} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="r-name">Name</Label>
              <Input
                id="r-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10!"
                disabled={isSystem}
                autoFocus={!isEdit}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r-scope">Scope</Label>
              <FormSelect
                id="r-scope"
                value={scope}
                onChange={(v) => setScope(v as Scope)}
                options={SCOPE_OPTIONS}
                placeholder="Select scope"
                disabled={isSystem}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="r-desc">Description (optional)</Label>
            <Input id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="h-10!" />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Permissions</Label>
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            </div>
            {/* Two columns + capped height so the dialog stays a fixed size no
                matter how many subjects the catalogue grows to. */}
            <div className="grid max-h-64 grid-cols-1 gap-x-6 gap-y-2.5 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-2">
              {bySubject.map(([subject, perms]) => (
                <div key={subject} className="flex items-start gap-2">
                  <span className="w-24 shrink-0 pt-0.5 text-sm font-medium text-foreground">{subject}</span>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {perms.map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                          className="size-4 accent-primary"
                        />
                        {titleCase(p.action)}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {mutationError && <FormError>{errorMessage(mutationError)}</FormError>}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="role-form" disabled={!valid || pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleDialog({ role, onClose }: { role: Role; onClose: () => void }) {
  const del = useDeleteRole();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {role.name}?</DialogTitle>
          <DialogDescription>
            {role.userCount > 0
              ? `${role.userCount} ${role.userCount === 1 ? "user still holds" : "users still hold"} this role — reassign them first.`
              : "This removes the role and its permissions. This can't be undone."}
          </DialogDescription>
        </DialogHeader>
        {del.isError && <FormError>{errorMessage(del.error)}</FormError>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={del.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={role.userCount > 0 || del.isPending}
            onClick={() => del.mutate(role.id, { onSuccess: onClose })}
          >
            {del.isPending ? "Deleting…" : "Delete role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
