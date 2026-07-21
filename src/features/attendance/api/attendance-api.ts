// Typed client fetchers for the Attendance feature. Everything goes through
// apiFetch (Firebase Bearer token). The class fetcher hits the shared /api/classes
// endpoint and maps to this feature's own option type — features must not import
// each other.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { ClassOption, MarkInput, RosterView, SaveResult, Weekday } from "@/features/attendance/types";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

// Load the marking context for a (class, date). `followsDay` is only needed when
// the date is a Saturday (which weekday's timetable it borrows).
export function fetchRoster(
  classId: string,
  date: string,
  followsDay?: Weekday,
): Promise<RosterView> {
  const q = new URLSearchParams({ classId, date });
  if (followsDay) q.set("followsDay", followsDay);
  return apiFetch<RosterView>(`/api/attendance?${q.toString()}`);
}

export function saveAttendance(input: MarkInput): Promise<SaveResult> {
  return apiFetch<SaveResult>("/api/attendance", { method: "POST", body: JSON.stringify(input) });
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
    label: `${c.programLabel} · ${roman(c.year)}-${c.section}`,
    shortLabel: `${roman(c.year)}-${c.section}`,
    programId: c.programId,
    programLabel: c.programLabel,
    isActive: c.isActive,
  }));
}
