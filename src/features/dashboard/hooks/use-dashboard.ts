// TanStack Query hook for the staff Dashboard overview, keyed by the caller's
// local "today" so it refreshes across a date boundary.
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchStaffOverview } from "@/features/dashboard/api/dashboard-api";

export function useStaffOverview(date: string) {
  return useQuery({
    queryKey: ["me", "staff-overview", date],
    queryFn: () => fetchStaffOverview(date),
    staleTime: 60_000,
  });
}
