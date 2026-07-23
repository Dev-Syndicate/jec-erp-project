// Typed client fetchers for the Leave/OD feature. Everything goes through apiFetch
// (Firebase Bearer token).
"use client";

import { apiFetch } from "@/lib/api-client";
import type { ApplyLeaveInput, LeaveAction, LeaveListView, LeaveRequest } from "@/features/leave/types";

export function fetchLeaveRequests(): Promise<LeaveListView> {
  return apiFetch<LeaveListView>("/api/leave");
}

export function applyForLeave(input: ApplyLeaveInput): Promise<LeaveRequest> {
  return apiFetch<LeaveRequest>("/api/leave", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function actOnLeave(
  id: string,
  action: LeaveAction,
): Promise<LeaveRequest & { daysMarked?: number }> {
  return apiFetch<LeaveRequest & { daysMarked?: number }>(
    `/api/leave/${encodeURIComponent(id)}/action`,
    { method: "POST", body: JSON.stringify(action) },
  );
}
