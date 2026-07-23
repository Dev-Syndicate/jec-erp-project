// TanStack Query hooks for the Marks feature. The assignments list is cached; the
// sheet is keyed by (class, subject, assessment); saving invalidates that sheet so
// the grid reflects what was stored.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchMarkAssignments,
  fetchMarksSheet,
  saveMarks,
} from "@/features/marks/api/marks-api";
import type { Assessment, SaveMarksInput } from "@/features/marks/types";

export function useMarkAssignments() {
  return useQuery({
    queryKey: ["marks", "assignments"],
    queryFn: fetchMarkAssignments,
    staleTime: 5 * 60_000,
  });
}

export function useMarksSheet(
  classId: string | null,
  subjectId: string | null,
  assessment: Assessment,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["marks", "sheet", classId, subjectId, assessment],
    queryFn: () => fetchMarksSheet(classId as string, subjectId as string, assessment),
    enabled,
  });
}

export function useSaveMarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveMarksInput) => saveMarks(input),
    onSuccess: (_r, input) =>
      qc.invalidateQueries({
        queryKey: ["marks", "sheet", input.classId, input.subjectId, input.assessment],
      }),
  });
}
