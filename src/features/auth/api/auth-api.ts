// Typed client-side fetchers for the auth feature. All authenticated calls use
// apiFetch from src/lib (attaches the Firebase Bearer token — CLAUDE.md
// boundary). resolve-roll is the one unauthenticated call (pre-sign-in).
"use client";

import { apiFetch } from "@/lib/api-client";
import type { AuthUser } from "@/features/auth/types";

export function fetchMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/api/auth/me");
}

/**
 * Resolve a student register number to the email Firebase authenticates against.
 * Unauthenticated (the student isn't signed in yet), so this uses a plain fetch
 * rather than apiFetch — there's no token to attach. The password is still
 * required for the subsequent Firebase sign-in.
 */
export async function resolveRegisterToEmail(registerNumber: string): Promise<string> {
  const res = await fetch("/api/auth/resolve-roll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registerNumber }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Couldn't look up that register number.");
  }
  const { email } = (await res.json()) as { email: string };
  return email;
}

/** Clear the mustChangePassword flag after a successful Firebase password change. */
export function clearMustChangePassword(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/auth/change-password", { method: "POST" });
}
