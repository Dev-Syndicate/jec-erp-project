// TanStack Query hooks for academic time. One query key (["academic","years"]);
// every mutation — including the activate switches, which touch many rows — just
// invalidates it and re-reads, so the single-active invariant the server enforces
// is always reflected accurately without hand-patching the cache.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AcademicYearInput, SemesterInput } from "@/features/academic/types";
import {
  activateAcademicYear,
  activateSemester,
  createAcademicYear,
  createSemester,
  deleteAcademicYear,
  deleteSemester,
  fetchAcademicYears,
  updateAcademicYear,
  updateSemester,
} from "@/features/academic/api/academic-api";

const YEARS_KEY = ["academic", "years"] as const;

export function useAcademicYears() {
  return useQuery({
    queryKey: YEARS_KEY,
    queryFn: fetchAcademicYears,
    staleTime: 30_000,
  });
}

function useInvalidateYears() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: YEARS_KEY });
}

// --- Academic years -------------------------------------------------------
export function useCreateAcademicYear() {
  const invalidate = useInvalidateYears();
  return useMutation({
    mutationFn: (input: AcademicYearInput) => createAcademicYear(input),
    onSuccess: invalidate,
  });
}

export function useUpdateAcademicYear() {
  const invalidate = useInvalidateYears();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AcademicYearInput }) =>
      updateAcademicYear(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteAcademicYear() {
  const invalidate = useInvalidateYears();
  return useMutation({ mutationFn: (id: string) => deleteAcademicYear(id), onSuccess: invalidate });
}

export function useActivateAcademicYear() {
  const invalidate = useInvalidateYears();
  return useMutation({ mutationFn: (id: string) => activateAcademicYear(id), onSuccess: invalidate });
}

// --- Semesters ------------------------------------------------------------
export function useCreateSemester() {
  const invalidate = useInvalidateYears();
  return useMutation({ mutationFn: (input: SemesterInput) => createSemester(input), onSuccess: invalidate });
}

export function useUpdateSemester() {
  const invalidate = useInvalidateYears();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { startDate: string; endDate: string } }) =>
      updateSemester(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteSemester() {
  const invalidate = useInvalidateYears();
  return useMutation({ mutationFn: (id: string) => deleteSemester(id), onSuccess: invalidate });
}

export function useActivateSemester() {
  const invalidate = useInvalidateYears();
  return useMutation({ mutationFn: (id: string) => activateSemester(id), onSuccess: invalidate });
}
