// TanStack Query hooks for the Attendance feature. The roster query is keyed by
// (class, date); saving a period invalidates that key so the grid
// re-reads the just-saved marks. Class options are their own lightly-cached query.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AssignCoverInput, DayInput, MarkInput } from "@/features/attendance/types";
import {
  assignCover,
  fetchAttendanceReport,
  fetchClassOptions,
  fetchCover,
  fetchDayAttendance,
  fetchMyTimetable,
  fetchRoster,
  removeCover,
  saveAttendance,
  saveDayAttendance,
} from "@/features/attendance/api/attendance-api";

// `enabled` is decided by the caller (a class and date must be chosen). A
// Saturday needs nothing extra: the server resolves it from the admin's
// WorkingDay declaration, and an undeclared one returns a 400 the UI surfaces.
export function useRoster(classId: string | null, date: string, enabled: boolean) {
  return useQuery({
    queryKey: ["attendance", "roster", classId, date],
    queryFn: () => fetchRoster(classId as string, date),
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

export function useMyTimetable() {
  return useQuery({
    queryKey: ["attendance", "my-timetable"],
    queryFn: fetchMyTimetable,
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
        queryKey: ["attendance", "roster", input.classId, input.date],
      }),
    // A refusal means the client's idea of who may mark is out of date — cover
    // can be revoked by a HOD while this page sits open, and the roster query is
    // cached (30s staleTime, no refetch on focus). Re-read so the grid locks
    // itself instead of leaving an editable table that can never save.
    onError: (_err, input) =>
      qc.invalidateQueries({
        queryKey: ["attendance", "roster", input.classId, input.date],
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

// --- Substitutions (cover) ---------------------------------------------------

// The day's periods for a class with any cover already arranged. Same
// (class, date) shape as the roster query, but its own key — this is the
// assigner's view, not the marker's.
export function useCover(classId: string | null, date: string, enabled: boolean) {
  return useQuery({
    queryKey: ["attendance", "cover", classId, date],
    queryFn: () => fetchCover(classId as string, date),
    enabled,
  });
}

// Assigning or removing cover changes WHO MAY MARK, so both invalidate the
// roster query as well as the cover view — otherwise the marking screen would
// keep showing a stale `canMark` and lock out the teacher who was just assigned.
function useCoverMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", "cover"] });
      qc.invalidateQueries({ queryKey: ["attendance", "roster"] });
    },
  });
}

export function useAssignCover() {
  return useCoverMutation((input: AssignCoverInput) => assignCover(input));
}

export function useRemoveCover() {
  return useCoverMutation(({ slotId, date }: { slotId: string; date: string }) =>
    removeCover(slotId, date),
  );
}
