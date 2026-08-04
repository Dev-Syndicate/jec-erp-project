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
