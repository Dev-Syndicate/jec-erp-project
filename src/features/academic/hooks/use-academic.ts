// TanStack Query hooks for the academic feature (years + terms).
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  activateTerm,
  activateYear,
  createTerm,
  createYear,
  listYears,
} from "@/features/academic/api/academic-api";
import type { AcademicYear, NewTermInput, NewYearInput } from "@/features/academic/types";

export function useAcademicYears() {
  return useQuery({ queryKey: ["academic-years"], queryFn: listYears });
}

// Convenience: the currently active term (and its year), derived from the list.
export function useActiveTerm() {
  const years = useAcademicYears();
  const activeYear = years.data?.find((y) => y.isActive);
  const activeTerm = years.data
    ?.flatMap((y) => y.terms)
    .find((t) => t.isActive);
  return { activeYear, activeTerm, isPending: years.isPending };
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["academic-years"] });
}

export function useCreateYear() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: NewYearInput) => createYear(input),
    onSuccess: invalidate,
  });
}

export function useActivateYear() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => activateYear(id), onSuccess: invalidate });
}

export function useCreateTerm() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ yearId, input }: { yearId: string; input: NewTermInput }) =>
      createTerm(yearId, input),
    onSuccess: invalidate,
  });
}

export function useActivateTerm() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => activateTerm(id), onSuccess: invalidate });
}

export type { AcademicYear };
