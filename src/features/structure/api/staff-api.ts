// Fetch staff as advisor-picker options. Hits the shared /api/faculty list and
// maps to StaffOption — the Structure slice must not import the Faculty slice, so
// it re-maps the response to its own type. Only ACTIVE staff can be an advisor.
//
// Keyed on DEPARTMENT, not program: a class teacher is staff of the department
// that OWNS the class, and staff carry no award at all now (an S&H lecturer's
// programId is null). Filtering these by program would return nobody.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { StaffOption } from "@/features/structure/types";

type RawFaculty = {
  userId: string;
  displayName: string;
  designation: string | null;
  departmentId: string;
  departmentCode: string;
  status: "ACTIVE" | "INACTIVE";
};

export async function fetchStaffOptions(): Promise<StaffOption[]> {
  const faculty = await apiFetch<RawFaculty[]>("/api/faculty");
  return faculty
    .filter((f) => f.status === "ACTIVE")
    .map((f) => ({
      userId: f.userId,
      displayName: f.displayName,
      departmentId: f.departmentId,
      departmentCode: f.departmentCode,
      designation: f.designation,
    }));
}
