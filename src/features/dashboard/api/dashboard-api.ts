// Typed client fetcher for the staff Dashboard overview. Goes through apiFetch.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { StaffOverview } from "@/features/dashboard/types";

export function fetchStaffOverview(date: string): Promise<StaffOverview> {
  return apiFetch<StaffOverview>(`/api/me/staff-overview?date=${encodeURIComponent(date)}`);
}
