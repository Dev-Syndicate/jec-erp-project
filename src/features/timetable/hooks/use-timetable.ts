// TanStack Query hooks for the Timetable feature. The grid query is keyed by
// class (["timetable", classId]); upsert/clear mutations invalidate that class's
// grid so it re-reads. Picker options are their own lightly-cached queries.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SlotInput } from "@/features/timetable/types";
import {
  deleteSlot,
  fetchClassOptions,
  fetchFacultyOptions,
  fetchSubjectOptions,
  fetchTimetable,
  upsertSlot,
} from "@/features/timetable/api/timetable-api";

export function useTimetable(classId: string | null) {
  return useQuery({
    queryKey: ["timetable", classId],
    queryFn: () => fetchTimetable(classId as string),
    enabled: !!classId,
  });
}

export function useClassOptions() {
  return useQuery({ queryKey: ["timetable", "classes"], queryFn: fetchClassOptions, staleTime: 5 * 60_000 });
}
export function useSubjectOptions() {
  return useQuery({ queryKey: ["timetable", "subjects"], queryFn: fetchSubjectOptions, staleTime: 5 * 60_000 });
}
export function useFacultyOptions() {
  return useQuery({ queryKey: ["timetable", "faculty"], queryFn: fetchFacultyOptions, staleTime: 5 * 60_000 });
}

export function useUpsertSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SlotInput) => upsertSlot(input),
    onSuccess: (_data, input) =>
      qc.invalidateQueries({ queryKey: ["timetable", input.classId] }),
  });
}

export function useDeleteSlot() {
  const qc = useQueryClient();
  return useMutation({
    // classId travels with the call so we can invalidate that class's grid.
    mutationFn: ({ id }: { id: string; classId: string }) => deleteSlot(id),
    onSuccess: (_data, { classId }) =>
      qc.invalidateQueries({ queryKey: ["timetable", classId] }),
  });
}
