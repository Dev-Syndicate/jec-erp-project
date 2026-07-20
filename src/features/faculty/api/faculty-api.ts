// Typed client fetchers for the Faculty feature. Everything goes through apiFetch
// (Firebase Bearer token). The program option fetcher hits the shared
// /api/programs endpoint directly and maps to this feature's own picker type —
// features must not import each other, so we don't reuse the structure feature's
// hooks/types.
"use client";

import { apiFetch } from "@/lib/api-client";
import type {
  Faculty,
  FacultyInput,
  FacultyPatch,
  ProgramOption,
  ProvisionResult,
} from "@/features/faculty/types";

// --- Faculty --------------------------------------------------------------
export function fetchFaculty(): Promise<Faculty[]> {
  return apiFetch<Faculty[]>("/api/faculty");
}

export function createFaculty(input: FacultyInput): Promise<ProvisionResult> {
  return apiFetch<ProvisionResult>("/api/faculty", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateFaculty(id: string, patch: FacultyPatch): Promise<Faculty> {
  return apiFetch<Faculty>(`/api/faculty/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function regeneratePassword(id: string): Promise<{ tempPassword: string }> {
  return apiFetch<{ tempPassword: string }>(`/api/faculty/${id}/regenerate-password`, {
    method: "POST",
  });
}

// --- Picker options (mapped from the shared structure endpoint) -----------
type RawProgram = {
  id: string;
  degreeCode: string;
  branchCode: string;
  durationYears: number;
  isActive: boolean;
};

export async function fetchProgramOptions(): Promise<ProgramOption[]> {
  const programs = await apiFetch<RawProgram[]>("/api/programs");
  return programs.map((p) => ({
    id: p.id,
    label: `${p.degreeCode} · ${p.branchCode}`,
    durationYears: p.durationYears,
    isActive: p.isActive,
  }));
}
