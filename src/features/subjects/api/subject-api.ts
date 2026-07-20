// Typed client fetchers for Subjects. Everything goes through apiFetch (Firebase
// Bearer token). The program-option fetch hits the shared /api/programs endpoint
// and maps to this feature's own picker type — features must not import each other.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { ProgramOption, Subject, SubjectInput } from "@/features/subjects/types";

export function fetchSubjects(): Promise<Subject[]> {
  return apiFetch<Subject[]>("/api/subjects");
}

export function createSubject(input: SubjectInput): Promise<Subject> {
  return apiFetch<Subject>("/api/subjects", { method: "POST", body: JSON.stringify(input) });
}

// Partial update — pass only changed fields (name/code/semesterNumber, or
// isActive to deactivate/reactivate). Program isn't editable.
export function updateSubject(
  id: string,
  input: Partial<Omit<SubjectInput, "programId">> & { isActive?: boolean },
): Promise<Subject> {
  return apiFetch<Subject>(`/api/subjects/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteSubject(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/subjects/${id}`, { method: "DELETE" });
}

type RawProgram = {
  id: string;
  degreeId: string;
  degreeCode: string;
  branchId: string;
  branchCode: string;
  durationYears: number;
  isActive: boolean;
};

export async function fetchProgramOptions(): Promise<ProgramOption[]> {
  const programs = await apiFetch<RawProgram[]>("/api/programs");
  return programs.map((p) => ({
    id: p.id,
    label: `${p.degreeCode} · ${p.branchCode}`,
    degreeId: p.degreeId,
    degreeLabel: p.degreeCode,
    branchId: p.branchId,
    branchLabel: p.branchCode,
    durationYears: p.durationYears,
    isActive: p.isActive,
  }));
}
