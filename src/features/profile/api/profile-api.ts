// Client-side fetcher for the profile feature. Uses apiFetch (attaches the
// Firebase Bearer token — CLAUDE.md boundary).
"use client";

import { apiFetch } from "@/lib/api-client";
import type { Profile } from "@/features/profile/types";

export function fetchProfile(): Promise<Profile> {
  return apiFetch<Profile>("/api/profile");
}
