// Typed client fetcher for the Student portal — one self-scoped endpoint that
// returns everything the dashboard needs. Goes through apiFetch (Bearer token).
"use client";

import { apiFetch } from "@/lib/api-client";
import type { StudentOverview } from "@/features/student-portal/types";

export function fetchStudentOverview(): Promise<StudentOverview> {
  return apiFetch<StudentOverview>("/api/me/overview");
}
