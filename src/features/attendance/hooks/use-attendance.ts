// TanStack Query hooks for the Attendance feature. The roster query is keyed by
// (class, date, followsDay); saving a period invalidates that key so the grid
// re-reads the just-saved marks. Class options are their own lightly-cached query.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { MarkInput, Weekday } from "@/features/attendance/types";
import { fetchClassOptions, fetchRoster, saveAttendance } from "@/features/attendance/api/attendance-api";

// `enabled` is decided by the caller — a Saturday must have chosen its followsDay
// before the request is valid (otherwise the API would 400).
export function useRoster(
  classId: string | null,
  date: string,
  followsDay: Weekday | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["attendance", "roster", classId, date, followsDay ?? null],
    queryFn: () => fetchRoster(classId as string, date, followsDay),
    enabled,
  });
}

export function useClassOptions() {
  return useQuery({ queryKey: ["attendance", "classes"], queryFn: fetchClassOptions, staleTime: 5 * 60_000 });
}

export function useSaveAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MarkInput) => saveAttendance(input),
    onSuccess: (_data, input) =>
      qc.invalidateQueries({
        queryKey: ["attendance", "roster", input.classId, input.date, input.followsDay ?? null],
      }),
  });
}
