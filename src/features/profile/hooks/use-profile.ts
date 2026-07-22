// Profile feature hook — the signed-in user's own full detail behind TanStack
// Query (CLAUDE.md: data fetching is always a hook wrapping apiFetch).
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchProfile } from "@/features/profile/api/profile-api";

export function useProfile() {
  return useQuery({
    queryKey: ["profile", "me"],
    queryFn: fetchProfile,
    staleTime: 60_000,
  });
}
