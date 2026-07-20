// Typed client fetchers for the Students feature. Everything goes through apiFetch
// (Firebase Bearer token). The program/class option fetchers hit the shared
// /api/programs and /api/classes endpoints directly and map to this feature's own
// picker types — features must not import each other, so we don't reuse the
// structure feature's hooks/types.
"use client";

import { apiFetch } from "@/lib/api-client";
import type {
  ClassOption,
  ImportPreview,
  ImportResult,
  ProgramOption,
  ProvisionResult,
  Student,
  StudentInput,
  StudentPatch,
} from "@/features/students/types";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

// --- Students -------------------------------------------------------------
export function fetchStudents(): Promise<Student[]> {
  return apiFetch<Student[]>("/api/students");
}

export function createStudent(input: StudentInput): Promise<ProvisionResult> {
  return apiFetch<ProvisionResult>("/api/students", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateStudent(id: string, patch: StudentPatch): Promise<Student> {
  return apiFetch<Student>(`/api/students/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function regeneratePassword(id: string): Promise<{ tempPassword: string }> {
  return apiFetch<{ tempPassword: string }>(`/api/students/${id}/regenerate-password`, {
    method: "POST",
  });
}

export function enrollStudent(id: string, classId: string): Promise<Student> {
  return apiFetch<Student>(`/api/students/${id}/enroll`, {
    method: "POST",
    body: JSON.stringify({ classId }),
  });
}

// --- Bulk import ----------------------------------------------------------
// FormData bodies: apiFetch leaves Content-Type unset so the browser adds the
// multipart boundary. dryRun=true parses only (preview); omitting it commits.
function importForm(file: File, programId: string, dryRun: boolean): FormData {
  const form = new FormData();
  form.append("file", file);
  form.append("programId", programId);
  if (dryRun) form.append("dryRun", "true");
  return form;
}

export function previewImport(file: File, programId: string): Promise<ImportPreview> {
  return apiFetch<ImportPreview>("/api/students/import", {
    method: "POST",
    body: importForm(file, programId, true),
  });
}

export function commitImport(file: File, programId: string): Promise<ImportResult> {
  return apiFetch<ImportResult>("/api/students/import", {
    method: "POST",
    body: importForm(file, programId, false),
  });
}

// --- Picker options (mapped from the shared structure endpoints) ----------
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

type RawClass = {
  id: string;
  programId: string;
  programLabel: string;
  year: number;
  section: string;
  isActive: boolean;
};

export async function fetchClassOptions(): Promise<ClassOption[]> {
  const classes = await apiFetch<RawClass[]>("/api/classes");
  return classes.map((c) => ({
    id: c.id,
    programId: c.programId,
    label: `${c.programLabel} · ${roman(c.year)}-${c.section}`,
    isActive: c.isActive,
  }));
}
