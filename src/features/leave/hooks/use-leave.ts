// TanStack Query hooks for the Leave/OD feature. The list is one query; applying
// or acting on a request invalidates it so the queue/status refreshes.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { actOnLeave, applyForLeave, fetchLeaveRequests } from "@/features/leave/api/leave-api";
import type { ApplyLeaveInput, LeaveAction } from "@/features/leave/types";

export function useLeaveRequests() {
  return useQuery({
    queryKey: ["leave", "list"],
    queryFn: fetchLeaveRequests,
  });
}

export function useApplyForLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplyLeaveInput) => applyForLeave(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave", "list"] }),
  });
}

export function useActOnLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: LeaveAction }) => actOnLeave(id, action),
    // A final approval writes attendance — invalidate the leave list; attendance
    // views refetch on their own next visit.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave", "list"] }),
  });
}
