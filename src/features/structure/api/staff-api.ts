// Fetch staff as advisor-picker options. Hits the shared /api/faculty list and
// maps to StaffOption — the Structure slice must not import the Faculty slice, so
// it re-maps the response to its own type. Only ACTIVE staff can be an advisor.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { StaffOption } from "@/features/structure/types";

type RawFaculty = {
  userId: string;
  displayName: string;
  designation: string | null;
  programId: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export async function fetchStaffOptions(): Promise<StaffOption[]> {
  const faculty = await apiFetch<RawFaculty[]>("/api/faculty");
  return faculty
    .filter((f) => f.status === "ACTIVE")
    .map((f) => ({
      userId: f.userId,
      displayName: f.displayName,
      programId: f.programId,
      designation: f.designation,
    }));
}
