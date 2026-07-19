// TanStack Query hooks for Degrees — the Structure feature's data access. One
// query key (["structure", "degrees"]); every mutation invalidates it so the
// table reflects the server after any change.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { DegreeInput } from "@/features/structure/types";
import {
  createDegree,
  deleteDegree,
  fetchDegrees,
  updateDegree,
} from "@/features/structure/api/degree-api";

const DEGREES_KEY = ["structure", "degrees"] as const;

export function useDegrees() {
  return useQuery({
    queryKey: DEGREES_KEY,
    queryFn: fetchDegrees,
    staleTime: 30_000,
  });
}

export function useCreateDegree() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DegreeInput) => createDegree(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEGREES_KEY }),
  });
}

export function useUpdateDegree() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<DegreeInput> & { isActive?: boolean } }) =>
      updateDegree(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEGREES_KEY }),
  });
}

export function useDeleteDegree() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDegree(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEGREES_KEY }),
  });
}
