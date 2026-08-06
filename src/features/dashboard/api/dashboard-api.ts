// Typed client fetcher for the staff Dashboard overview. Goes through apiFetch.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { DashboardAnalytics, StaffOverview } from "@/features/dashboard/types";

export function fetchStaffOverview(date: string): Promise<StaffOverview> {
  return apiFetch<StaffOverview>(`/api/me/staff-overview?date=${encodeURIComponent(date)}`);
}

export function fetchDashboardAnalytics(date: string): Promise<DashboardAnalytics> {
  return apiFetch<DashboardAnalytics>(`/api/dashboard/analytics?date=${encodeURIComponent(date)}`);
}
