// Typed client fetchers for Degrees. Every call goes through apiFetch, which
// attaches the Firebase Bearer token (CLAUDE.md boundary). The hooks in
// ../hooks wrap these in TanStack Query — components never call these directly.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { Degree, DegreeInput } from "@/features/structure/types";

export function fetchDegrees(): Promise<Degree[]> {
  return apiFetch<Degree[]>("/api/degrees");
}

export function createDegree(input: DegreeInput): Promise<Degree> {
  return apiFetch<Degree>("/api/degrees", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Partial update — pass only the fields that change (name/code/durationYears, or
// isActive to deactivate/reactivate).
export function updateDegree(id: string, input: Partial<DegreeInput> & { isActive?: boolean }): Promise<Degree> {
  return apiFetch<Degree>(`/api/degrees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteDegree(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/degrees/${id}`, { method: "DELETE" });
}
