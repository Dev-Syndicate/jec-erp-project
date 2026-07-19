// TanStack Query hooks for the subject catalog.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createSubject, listSubjects, setSubjectActive } from "@/features/academic/api/subjects-api";
import type { NewSubjectInput } from "@/features/academic/types";

export function useSubjects(departmentId: string | undefined) {
  return useQuery({
    queryKey: ["subjects", departmentId],
    queryFn: () => listSubjects(departmentId!),
    enabled: !!departmentId,
  });
}

export function useCreateSubject(departmentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSubjectInput) => createSubject(departmentId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subjects", departmentId] }),
  });
}

export function useSetSubjectActive(departmentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setSubjectActive(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subjects", departmentId] }),
  });
}
