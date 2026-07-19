// TanStack Query hooks for teacher assignments.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAssignment,
  deleteAssignment,
  listAssignments,
  listTeachers,
} from "@/features/academic/api/assignments-api";
import type { NewAssignmentInput } from "@/features/academic/types";

export function useAssignments(departmentId: string | undefined) {
  return useQuery({
    queryKey: ["assignments", departmentId],
    queryFn: () => listAssignments(departmentId!),
    enabled: !!departmentId,
  });
}

export function useTeachers(departmentId: string | undefined) {
  return useQuery({
    queryKey: ["teachers", departmentId],
    queryFn: () => listTeachers(departmentId!),
    enabled: !!departmentId,
  });
}

export function useCreateAssignment(departmentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewAssignmentInput) => createAssignment(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments", departmentId] }),
  });
}

export function useDeleteAssignment(departmentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAssignment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments", departmentId] }),
  });
}
