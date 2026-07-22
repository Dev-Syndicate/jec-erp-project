// Typed client fetchers for the Roster feature. Everything goes through apiFetch
// (Firebase Bearer token). Advised classes come from the shared attendance
// endpoint (scope=day → classes the caller advises); the roster + edits are the
// /api/roster endpoint.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { ClassOption, ClassRosterView, StudentDetail, StudentPatch } from "@/features/roster/types";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

type RawClass = {
  id: string;
  programId: string;
  programLabel: string;
  year: number;
  section: string;
  isActive: boolean;
};

// The classes the caller can manage = the classes they advise (scope=day on the
// shared attendance endpoint; HOD/SA get their program's).
export async function fetchAdvisedClasses(): Promise<ClassOption[]> {
  const classes = await apiFetch<RawClass[]>("/api/attendance/classes?scope=day");
  return classes.map((c) => ({
    id: c.id,
    label: `${c.programLabel} · ${roman(c.year)}-${c.section}`,
    shortLabel: `${roman(c.year)}-${c.section}`,
    programId: c.programId,
    programLabel: c.programLabel,
    isActive: c.isActive,
  }));
}

export function fetchClassRoster(classId: string): Promise<ClassRosterView> {
  return apiFetch<ClassRosterView>(`/api/roster?classId=${encodeURIComponent(classId)}`);
}

export function updateStudent(studentId: string, patch: StudentPatch): Promise<StudentDetail> {
  return apiFetch<StudentDetail>("/api/roster", {
    method: "PATCH",
    body: JSON.stringify({ studentId, ...patch }),
  });
}
