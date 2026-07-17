// Typed client-side fetchers for the departments feature — hit /api/departments
// through the authenticated apiFetch (Firebase Bearer token attached in lib).
"use client";

import { apiFetch } from "@/lib/api-client";
import type { Department, CreateDepartmentInput } from "@/features/departments/types";

// The API returns Prisma's `_count`; normalise it to our `counts` shape here so
// components don't depend on the wire format.
type DepartmentWire = Omit<Department, "counts"> & {
  _count?: { classes: number; users: number };
};

export async function listDepartments(): Promise<Department[]> {
  const { departments } = await apiFetch<{ departments: DepartmentWire[] }>("/api/departments");
  return departments.map(({ _count, ...d }) => ({
    ...d,
    counts: _count ? { classes: _count.classes, users: _count.users } : undefined,
  }));
}

export async function createDepartment(input: CreateDepartmentInput): Promise<Department> {
  const { department } = await apiFetch<{ department: Department }>("/api/departments", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return department;
}
