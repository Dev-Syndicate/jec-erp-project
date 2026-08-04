// Staff options for the cover picker — who can be assigned to take a period.
//
// This feature reads /api/faculty directly and maps to its own local type rather
// than importing from the Faculty feature: features must not import each other
// (CLAUDE.md). The endpoint is already department-scoped server-side, so a HOD
// only ever sees the staff their own department employs.
//
// Pass the OWNING department of the class being covered: the server then returns
// the staff it employs PLUS anyone attached to it this semester — the same set
// POST /api/attendance/substitutions accepts. The caller must NOT re-filter on
// departmentId; a visiting lecturer's own department never matches the host's, so
// that would hide exactly the people attachments exist to make available.
"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-client";

export type FacultyOption = {
  // The USER id — that's what a substitution points at (SlotSubstitution
  // .substituteId references User, not FacultyProfile).
  userId: string;
  displayName: string;
  // The department that EMPLOYS them — what the cover picker matches against
  // the class's owner.
  departmentId: string;
  departmentCode: string;
};

type RawFaculty = {
  userId: string;
  displayName: string;
  departmentId: string;
  departmentCode: string;
  status: "ACTIVE" | "INACTIVE";
};

export function useFacultyOptions(teachingIn?: string) {
  return useQuery({
    // Keyed on the host department so switching class refetches rather than
    // reusing another department's list. Disabled until it's known, or the first
    // fetch would cache the unscoped list under an undefined key.
    queryKey: ["attendance", "faculty-options", teachingIn ?? null],
    enabled: teachingIn !== undefined,
    queryFn: async (): Promise<FacultyOption[]> => {
      const rows = await apiFetch<RawFaculty[]>(
        teachingIn ? `/api/faculty?teachingIn=${encodeURIComponent(teachingIn)}` : "/api/faculty",
      );
      return rows
        // A deactivated account can't be given marking rights (the API refuses
        // it too) — don't offer it.
        .filter((f) => f.status === "ACTIVE")
        .map((f) => ({
          userId: f.userId,
          displayName: f.displayName,
          departmentId: f.departmentId,
          departmentCode: f.departmentCode,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
    staleTime: 5 * 60_000,
  });
}
