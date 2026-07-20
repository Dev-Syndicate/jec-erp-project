// TanStack Query hooks for Subjects. One list key (["subjects","list"]); every
// mutation invalidates it. Program options are a separate, lightly-cached query
// for the create form's program picker + semester bounding.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SubjectInput } from "@/features/subjects/types";
import {
  createSubject,
  deleteSubject,
  fetchProgramOptions,
  fetchSubjects,
  updateSubject,
} from "@/features/subjects/api/subject-api";

const SUBJECTS_KEY = ["subjects", "list"] as const;

export function useSubjects() {
  return useQuery({ queryKey: SUBJECTS_KEY, queryFn: fetchSubjects, staleTime: 30_000 });
}

export function useProgramOptions() {
  return useQuery({
    queryKey: ["subjects", "program-options"],
    queryFn: fetchProgramOptions,
    staleTime: 5 * 60_000,
  });
}

function useInvalidateSubjects() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SUBJECTS_KEY });
}

export function useCreateSubject() {
  const invalidate = useInvalidateSubjects();
  return useMutation({ mutationFn: (input: SubjectInput) => createSubject(input), onSuccess: invalidate });
}

export function useUpdateSubject() {
  const invalidate = useInvalidateSubjects();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<Omit<SubjectInput, "programId">> & { isActive?: boolean };
    }) => updateSubject(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteSubject() {
  const invalidate = useInvalidateSubjects();
  return useMutation({ mutationFn: (id: string) => deleteSubject(id), onSuccess: invalidate });
}
