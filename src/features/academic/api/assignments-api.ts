// Client-side fetchers for teacher assignments (active-term scoped). Also a
// teachers list (hits /api/faculty) so the assignment form can pick a teacher
// without the academic feature importing the faculty feature.
"use client";

import { apiFetch } from "@/lib/api-client";
import type {
  AssignmentsResponse,
  NewAssignmentInput,
  TeacherOption,
} from "@/features/academic/types";

export function listAssignments(departmentId: string): Promise<AssignmentsResponse> {
  return apiFetch<AssignmentsResponse>(`/api/teacher-assignments?departmentId=${departmentId}`);
}

export function createAssignment(input: NewAssignmentInput): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/teacher-assignments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteAssignment(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/teacher-assignments/${id}`, { method: "DELETE" });
}

// Teachers for the picker — the faculty list, mapped to {id, name}. Dept-scoped
// server-side; Super Admin gets all so we filter client-side by department.
export async function listTeachers(departmentId: string): Promise<TeacherOption[]> {
  const { faculty } = await apiFetch<{
    faculty: Array<{ id: string; name: string; departmentId: string | null; roles: string[] }>;
  }>("/api/faculty");
  return faculty
    .filter((f) => f.departmentId === departmentId)
    .map((f) => ({ id: f.id, name: f.name }));
}
