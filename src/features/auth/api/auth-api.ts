// Typed client-side fetchers for the auth feature. Every call attaches the
// current Firebase ID token as `Authorization: Bearer <token>` — the single
// credential the client holds (CLAUDE.md boundary). Same model on Flutter later.
"use client";

import { auth } from "@/lib/firebase";
import type { AuthUser } from "@/features/auth/types";

/** Current user's fresh ID token, or throw if not signed in. */
async function requireIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  // getIdToken() refreshes automatically if the token is near expiry.
  return user.getIdToken();
}

/** Authenticated fetch against our API — injects the Bearer token. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await requireIdToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export function fetchMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/api/auth/me");
}

/**
 * Resolve a student roll number to the email Firebase authenticates against.
 * Unauthenticated (the student isn't signed in yet), so this uses a plain fetch
 * rather than apiFetch — there's no token to attach. The password is still
 * required for the subsequent Firebase sign-in.
 */
export async function resolveRollToEmail(rollNumber: string): Promise<string> {
  const res = await fetch("/api/auth/resolve-roll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rollNumber }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Couldn't look up that roll number.");
  }
  const { email } = (await res.json()) as { email: string };
  return email;
}

/** Clear the mustChangePassword flag after a successful Firebase password change. */
export function clearMustChangePassword(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/auth/change-password", { method: "POST" });
}
