// Typed client fetchers for the Access (RBAC) feature. Everything goes through
// apiFetch (Firebase Bearer token). These hit the dedicated /api/rbac endpoints
// (distinct from /api/roles, which lists assignable roles for the faculty picker).
"use client";

import { apiFetch } from "@/lib/api-client";
import type { Permission, Role, RoleInput, RolePatch } from "@/features/access/types";

export function fetchRoles(): Promise<Role[]> {
  return apiFetch<Role[]>("/api/rbac/roles");
}

export function fetchPermissions(): Promise<Permission[]> {
  return apiFetch<Permission[]>("/api/rbac/permissions");
}

export function createRole(input: RoleInput): Promise<Role> {
  return apiFetch<Role>("/api/rbac/roles", { method: "POST", body: JSON.stringify(input) });
}

export function updateRole(id: string, patch: RolePatch): Promise<Role> {
  return apiFetch<Role>(`/api/rbac/roles/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteRole(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/rbac/roles/${id}`, { method: "DELETE" });
}
