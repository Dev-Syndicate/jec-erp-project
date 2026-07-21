// Staff options for the class advisor picker. Lightly cached — the staff list
// changes rarely relative to how often the class form opens.
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchStaffOptions } from "@/features/structure/api/staff-api";

export function useStaffOptions() {
  return useQuery({
    queryKey: ["structure", "staff-options"],
    queryFn: fetchStaffOptions,
    staleTime: 5 * 60_000,
  });
}
