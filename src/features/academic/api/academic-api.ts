// Client-side fetchers for the academic feature — years + terms. Authenticated
// via apiFetch (Bearer token).
"use client";

import { apiFetch } from "@/lib/api-client";
import type { AcademicYear, NewTermInput, NewYearInput, Term } from "@/features/academic/types";

export async function listYears(): Promise<AcademicYear[]> {
  const { years } = await apiFetch<{ years: AcademicYear[] }>("/api/academic/years");
  return years;
}

export async function createYear(input: NewYearInput): Promise<AcademicYear> {
  const { year } = await apiFetch<{ year: AcademicYear }>("/api/academic/years", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return year;
}

export function activateYear(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/academic/years/${id}/activate`, { method: "POST" });
}

export async function createTerm(yearId: string, input: NewTermInput): Promise<Term> {
  const { term } = await apiFetch<{ term: Term }>(`/api/academic/years/${yearId}/terms`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return term;
}

export function activateTerm(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/academic/terms/${id}/activate`, { method: "POST" });
}
