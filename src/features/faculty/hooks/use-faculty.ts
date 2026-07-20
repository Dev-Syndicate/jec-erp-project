// TanStack Query hooks for the Faculty feature. Mutations invalidate the faculty
// list so it reflects the server (new account, edit, status change). Program
// options are their own lightly-cached query used to populate the create dialog.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { FacultyInput, FacultyPatch } from "@/features/faculty/types";
import {
  createFaculty,
  fetchFaculty,
  fetchProgramOptions,
  regeneratePassword,
  updateFaculty,
} from "@/features/faculty/api/faculty-api";

const FACULTY_KEY = ["faculty", "list"] as const;

export function useFaculty() {
  return useQuery({ queryKey: FACULTY_KEY, queryFn: fetchFaculty, staleTime: 30_000 });
}

export function useProgramOptions() {
  return useQuery({
    queryKey: ["faculty", "program-options"],
    queryFn: fetchProgramOptions,
    staleTime: 5 * 60_000,
  });
}

function useInvalidateFaculty() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: FACULTY_KEY });
}

export function useCreateFaculty() {
  const invalidate = useInvalidateFaculty();
  return useMutation({ mutationFn: (input: FacultyInput) => createFaculty(input), onSuccess: invalidate });
}

export function useUpdateFaculty() {
  const invalidate = useInvalidateFaculty();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: FacultyPatch }) => updateFaculty(id, patch),
    onSuccess: invalidate,
  });
}

export function useRegeneratePassword() {
  // No list change — the caller reveals the returned password.
  return useMutation({ mutationFn: (id: string) => regeneratePassword(id) });
}
