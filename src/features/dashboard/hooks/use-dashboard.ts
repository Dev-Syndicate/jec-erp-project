// TanStack Query hook for the staff Dashboard overview, keyed by the caller's
// local "today" so it refreshes across a date boundary.
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchDashboardAnalytics, fetchStaffOverview } from "@/features/dashboard/api/dashboard-api";

export function useStaffOverview(date: string) {
  return useQuery({
    queryKey: ["me", "staff-overview", date],
    queryFn: () => fetchStaffOverview(date),
    staleTime: 60_000,
  });
}

/**
 * The Dashboard's analytics. Kept as its OWN query rather than folded into
 * useStaffOverview so the two fail independently: the overview (today's classes,
 * quick links) still renders if the heavier analytics query errors or is slow.
 */
export function useDashboardAnalytics(date: string) {
  return useQuery({
    queryKey: ["dashboard", "analytics", date],
    queryFn: () => fetchDashboardAnalytics(date),
    staleTime: 60_000,
  });
}
