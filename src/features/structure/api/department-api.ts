// Typed client fetchers for Departments (the organisational unit that runs
// programs and owns classes). Every call goes through apiFetch, which attaches
// the Firebase Bearer token (CLAUDE.md boundary). The hooks in ../hooks wrap
// these in TanStack Query — components never call these directly.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { Department, DepartmentInput } from "@/features/structure/types";

export function fetchDepartments(): Promise<Department[]> {
  return apiFetch<Department[]>("/api/departments");
}

export function createDepartment(input: DepartmentInput): Promise<Department> {
  return apiFetch<Department>("/api/departments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Partial update — name/code (rename) or isActive (the deactivate that stands in
// for a delete once the department owns anything).
export function updateDepartment(
  id: string,
  input: Partial<DepartmentInput> & { isActive?: boolean },
): Promise<Department> {
  return apiFetch<Department>(`/api/departments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// Only succeeds for a department that owns nothing at all; otherwise the API
// returns 409 telling the admin to deactivate instead.
export function deleteDepartment(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/departments/${id}`, { method: "DELETE" });
}
