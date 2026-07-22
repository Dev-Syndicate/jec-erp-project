// TanStack Query hooks for the Attendance feature. The roster query is keyed by
// (class, date, followsDay); saving a period invalidates that key so the grid
// re-reads the just-saved marks. Class options are their own lightly-cached query.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { DayInput, MarkInput, Weekday } from "@/features/attendance/types";
import {
  fetchAttendanceReport,
  fetchClassOptions,
  fetchDayAttendance,
  fetchRoster,
  saveAttendance,
  saveDayAttendance,
} from "@/features/attendance/api/attendance-api";

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

// `scope=day` returns only classes the Faculty advises (the day-record screen);
// omit it for the marking/report pickers (taught or advised).
export function useClassOptions(scope?: "day") {
  return useQuery({
    queryKey: ["attendance", "classes", scope ?? "mark"],
    queryFn: () => fetchClassOptions(scope),
    staleTime: 5 * 60_000,
  });
}

export function useAttendanceReport(classId: string | null) {
  return useQuery({
    queryKey: ["attendance", "report", classId],
    queryFn: () => fetchAttendanceReport(classId as string),
    enabled: !!classId,
  });
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

// `enabled` is decided by the caller — both a class and a date are needed.
export function useDayAttendance(classId: string | null, date: string, enabled: boolean) {
  return useQuery({
    queryKey: ["attendance", "day", classId, date],
    queryFn: () => fetchDayAttendance(classId as string, date),
    enabled,
  });
}

export function useSaveDayAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DayInput) => saveDayAttendance(input),
    onSuccess: (_data, input) =>
      qc.invalidateQueries({ queryKey: ["attendance", "day", input.classId, input.date] }),
  });
}
