// Typed client fetchers for Classes. Every call goes through apiFetch, which
// attaches the Firebase Bearer token (CLAUDE.md boundary). The hooks in
// ../hooks wrap these in TanStack Query — components never call these directly.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { Class, ClassInput } from "@/features/structure/types";

export function fetchClasses(): Promise<Class[]> {
  return apiFetch<Class[]>("/api/classes");
}

export function createClass(input: ClassInput): Promise<Class> {
  return apiFetch<Class>("/api/classes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Partial update — pass only the fields that change. Program is fixed after
// create, so only year/section/advisor (or isActive to deactivate/reactivate) are
// editable.
export function updateClass(
  id: string,
  input: Partial<Pick<ClassInput, "year" | "section" | "advisorId">> & { isActive?: boolean },
): Promise<Class> {
  return apiFetch<Class>(`/api/classes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteClass(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/classes/${id}`, { method: "DELETE" });
}
