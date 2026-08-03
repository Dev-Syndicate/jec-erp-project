// Staff options for the cover picker — who can be assigned to take a period.
//
// This feature reads /api/faculty directly and maps to its own local type rather
// than importing from the Faculty feature: features must not import each other
// (CLAUDE.md). The endpoint is already program-scoped server-side, so a HOD only
// ever sees their own program's staff.
"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-client";

export type FacultyOption = {
  // The USER id — that's what a substitution points at (SlotSubstitution
  // .substituteId references User, not FacultyProfile).
  userId: string;
  displayName: string;
};

type RawFaculty = { userId: string; displayName: string; status: "ACTIVE" | "INACTIVE" };

export function useFacultyOptions() {
  return useQuery({
    queryKey: ["attendance", "faculty-options"],
    queryFn: async (): Promise<FacultyOption[]> => {
      const rows = await apiFetch<RawFaculty[]>("/api/faculty");
      return rows
        // A deactivated account can't be given marking rights (the API refuses
        // it too) — don't offer it.
        .filter((f) => f.status === "ACTIVE")
        .map((f) => ({ userId: f.userId, displayName: f.displayName }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
    staleTime: 5 * 60_000,
  });
}
