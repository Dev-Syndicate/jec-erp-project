// Typed client fetchers for Programs (Degree × Branch pairings). Every call goes
// through apiFetch, which attaches the Firebase Bearer token (CLAUDE.md boundary).
// The hooks in ../hooks wrap these in TanStack Query — components never call these
// directly.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { Program, ProgramInput } from "@/features/structure/types";

export function fetchPrograms(): Promise<Program[]> {
  return apiFetch<Program[]>("/api/programs");
}

export function createProgram(input: ProgramInput): Promise<Program> {
  return apiFetch<Program>("/api/programs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// The only editable field is isActive (deactivate/reactivate) — the pairing itself
// never changes.
export function updateProgram(id: string, input: { isActive: boolean }): Promise<Program> {
  return apiFetch<Program>(`/api/programs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteProgram(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/programs/${id}`, { method: "DELETE" });
}
