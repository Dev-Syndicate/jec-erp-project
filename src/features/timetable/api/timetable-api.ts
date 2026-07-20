// Typed client fetchers for the Timetable feature. Everything goes through
// apiFetch (Firebase Bearer token). The picker fetchers hit the shared
// classes/subjects/faculty endpoints and map to this feature's own option types
// — features must not import each other.
"use client";

import { apiFetch } from "@/lib/api-client";
import type {
  ClassOption,
  FacultyOption,
  SlotInput,
  SubjectOption,
  TimetableSlot,
  TimetableView,
} from "@/features/timetable/types";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

export function fetchTimetable(classId: string): Promise<TimetableView> {
  return apiFetch<TimetableView>(`/api/timetable?classId=${encodeURIComponent(classId)}`);
}

export function upsertSlot(input: SlotInput): Promise<TimetableSlot> {
  return apiFetch<TimetableSlot>("/api/timetable", { method: "POST", body: JSON.stringify(input) });
}

export function deleteSlot(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/timetable/${id}`, { method: "DELETE" });
}

// --- Picker options -------------------------------------------------------
type RawClass = { id: string; programId: string; programLabel: string; year: number; section: string; isActive: boolean };
export async function fetchClassOptions(): Promise<ClassOption[]> {
  const classes = await apiFetch<RawClass[]>("/api/classes");
  return classes.map((c) => ({
    id: c.id,
    label: `${c.programLabel} · ${roman(c.year)}-${c.section}`,
    shortLabel: `${roman(c.year)}-${c.section}`,
    programId: c.programId,
    programLabel: c.programLabel,
    isActive: c.isActive,
  }));
}

type RawSubject = { id: string; code: string; name: string; programId: string; semesterNumber: number; isActive: boolean };
export async function fetchSubjectOptions(): Promise<SubjectOption[]> {
  const subjects = await apiFetch<RawSubject[]>("/api/subjects");
  return subjects.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    programId: s.programId,
    semesterNumber: s.semesterNumber,
    isActive: s.isActive,
  }));
}

type RawFaculty = { userId: string; displayName: string; programId: string | null; status: "ACTIVE" | "INACTIVE" };
export async function fetchFacultyOptions(): Promise<FacultyOption[]> {
  const faculty = await apiFetch<RawFaculty[]>("/api/faculty");
  // A slot's facultyId references User.id — so map to userId, not the profile id.
  return faculty.map((f) => ({
    id: f.userId,
    name: f.displayName,
    programId: f.programId,
    status: f.status,
  }));
}
