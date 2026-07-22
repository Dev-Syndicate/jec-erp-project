// TanStack Query hook for the Student portal overview.
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchStudentOverview } from "@/features/student-portal/api/portal-api";

export function useStudentOverview() {
  return useQuery({
    queryKey: ["me", "overview"],
    queryFn: fetchStudentOverview,
    staleTime: 60_000,
  });
}
