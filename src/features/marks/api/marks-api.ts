// Typed client fetchers for the Marks feature. Everything goes through apiFetch
// (Firebase Bearer token). The assignments picker + the per-assessment sheet are
// the /api/marks endpoints.
"use client";

import { apiFetch } from "@/lib/api-client";
import type {
  Assessment,
  MarkAssignmentsView,
  MarksSheet,
  SaveMarksInput,
} from "@/features/marks/types";

export function fetchMarkAssignments(): Promise<MarkAssignmentsView> {
  return apiFetch<MarkAssignmentsView>("/api/marks/assignments");
}

export function fetchMarksSheet(
  classId: string,
  subjectId: string,
  assessment: Assessment,
): Promise<MarksSheet> {
  const q = new URLSearchParams({ classId, subjectId, assessment });
  return apiFetch<MarksSheet>(`/api/marks?${q.toString()}`);
}

export function saveMarks(input: SaveMarksInput): Promise<{ saved: number }> {
  return apiFetch<{ saved: number }>("/api/marks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
