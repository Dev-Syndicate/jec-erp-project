// Typed client fetchers for academic years + semesters. Every call goes through
// apiFetch (Firebase Bearer token). The hooks in ../hooks wrap these in TanStack
// Query — components never call these directly. Activate endpoints return the
// affected year (with its semesters) so the cache reflects the switch at once.
"use client";

import { apiFetch } from "@/lib/api-client";
import type {
  AcademicYear,
  AcademicYearInput,
  Semester,
  SemesterInput,
} from "@/features/academic/types";

// --- Academic years -------------------------------------------------------
export function fetchAcademicYears(): Promise<AcademicYear[]> {
  return apiFetch<AcademicYear[]>("/api/academic-years");
}

export function createAcademicYear(input: AcademicYearInput): Promise<AcademicYear> {
  return apiFetch<AcademicYear>("/api/academic-years", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAcademicYear(id: string, input: AcademicYearInput): Promise<AcademicYear> {
  return apiFetch<AcademicYear>(`/api/academic-years/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteAcademicYear(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/academic-years/${id}`, { method: "DELETE" });
}

export function activateAcademicYear(id: string): Promise<AcademicYear> {
  return apiFetch<AcademicYear>(`/api/academic-years/${id}/activate`, { method: "POST" });
}

// --- Semesters ------------------------------------------------------------
export function createSemester(input: SemesterInput): Promise<Semester> {
  return apiFetch<Semester>("/api/semesters", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Only the date window is editable (kind + year are structural).
export function updateSemester(
  id: string,
  input: { startDate: string; endDate: string },
): Promise<Semester> {
  return apiFetch<Semester>(`/api/semesters/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteSemester(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/semesters/${id}`, { method: "DELETE" });
}

// Returns the parent year (semester activation also switches the active year).
export function activateSemester(id: string): Promise<AcademicYear> {
  return apiFetch<AcademicYear>(`/api/semesters/${id}/activate`, { method: "POST" });
}
