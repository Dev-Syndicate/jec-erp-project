// TanStack Query hooks for the faculty feature.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getFaculty,
  listFaculty,
  regenerateFacultyPassword,
  saveFacultyProfile,
} from "@/features/faculty/api/faculty-api";
import type { FacultyProfileInput } from "@/features/faculty/types";

export function useFacultyList() {
  return useQuery({ queryKey: ["faculty"], queryFn: listFaculty });
}

export function useFaculty(id: string) {
  return useQuery({ queryKey: ["faculty", id], queryFn: () => getFaculty(id), enabled: !!id });
}

export function useSaveFacultyProfile(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: FacultyProfileInput) => saveFacultyProfile(id, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faculty", id] });
      qc.invalidateQueries({ queryKey: ["faculty"] });
    },
  });
}

export function useRegenerateFacultyPassword(id: string) {
  return useMutation({ mutationFn: () => regenerateFacultyPassword(id) });
}
