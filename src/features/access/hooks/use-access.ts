// TanStack Query hooks for the Access (RBAC) feature. Role mutations invalidate
// the roles list so it reflects the server. The permission catalog is static-ish,
// so it's cached longer.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RoleInput, RolePatch } from "@/features/access/types";
import {
  createRole,
  deleteRole,
  fetchPermissions,
  fetchRoles,
  updateRole,
} from "@/features/access/api/access-api";

const ROLES_KEY = ["access", "roles"] as const;

export function useRoles() {
  return useQuery({ queryKey: ROLES_KEY, queryFn: fetchRoles, staleTime: 30_000 });
}

export function usePermissions() {
  return useQuery({ queryKey: ["access", "permissions"], queryFn: fetchPermissions, staleTime: 10 * 60_000 });
}

function useInvalidateRoles() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ROLES_KEY });
}

export function useCreateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: (input: RoleInput) => createRole(input), onSuccess: invalidate });
}

export function useUpdateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RolePatch }) => updateRole(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: (id: string) => deleteRole(id), onSuccess: invalidate });
}
