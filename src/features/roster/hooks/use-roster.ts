// TanStack Query hooks for the Roster feature. The roster query is keyed by class;
// editing a student invalidates it so the list reflects the saved detail.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchAdvisedClasses,
  fetchClassRoster,
  updateStudent,
} from "@/features/roster/api/roster-api";
import type { StudentPatch } from "@/features/roster/types";

export function useAdvisedClasses() {
  return useQuery({
    queryKey: ["roster", "advised-classes"],
    queryFn: fetchAdvisedClasses,
    staleTime: 5 * 60_000,
  });
}

export function useClassRoster(classId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["roster", "class", classId],
    queryFn: () => fetchClassRoster(classId as string),
    enabled,
  });
}

export function useUpdateStudent(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, patch }: { studentId: string; patch: StudentPatch }) =>
      updateStudent(studentId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roster", "class", classId] }),
  });
}
