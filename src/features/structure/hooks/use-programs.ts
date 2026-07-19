// TanStack Query hooks for Programs — the Structure feature's data access. One
// query key (["structure", "programs"]); every mutation invalidates it so the
// table reflects the server after any change.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ProgramInput } from "@/features/structure/types";
import {
  createProgram,
  deleteProgram,
  fetchPrograms,
  updateProgram,
} from "@/features/structure/api/program-api";

const PROGRAMS_KEY = ["structure", "programs"] as const;

export function usePrograms() {
  return useQuery({
    queryKey: PROGRAMS_KEY,
    queryFn: fetchPrograms,
    staleTime: 30_000,
  });
}

export function useCreateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProgramInput) => createProgram(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROGRAMS_KEY }),
  });
}

export function useUpdateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateProgram(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROGRAMS_KEY }),
  });
}

export function useDeleteProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProgram(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROGRAMS_KEY }),
  });
}
