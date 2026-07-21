// Types owned by the Access (RBAC) feature — the admin console for roles +
// permissions. Roles are configurable data: the admin composes them from the
// permission catalog. Kept local — no cross-feature imports.

export type Scope = "PROGRAM" | "INSTITUTION";

// One entry in the permission catalog (CASL-shaped action + subject).
export type Permission = {
  id: string;
  action: string; // "manage" | "read" | "mark" | "enter"
  subject: string; // "Student" | "Attendance" | …
};

// A role with its granted permissions and how many users hold it.
export type Role = {
  id: string;
  name: string;
  description: string | null;
  scope: Scope;
  isSystem: boolean; // seeded — can't be renamed/re-scoped/deleted
  permissionIds: string[];
  userCount: number;
};

// Body for POST /api/rbac/roles.
export type RoleInput = {
  name: string;
  description?: string | null;
  scope: Scope;
  permissionIds: string[];
};

// Body for PATCH /api/rbac/roles/[id] — every field optional; permissionIds
// (when present) replaces the whole set.
export type RolePatch = {
  name?: string;
  description?: string | null;
  scope?: Scope;
  permissionIds?: string[];
};
