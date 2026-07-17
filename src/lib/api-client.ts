// Authenticated client-side fetch — the single way feature code talks to our
// API. It attaches the current Firebase ID token as `Authorization: Bearer
// <token>`, the only credential the client holds (CLAUDE.md security boundary).
//
// This is cross-cutting (used by every feature), so it lives in src/lib, not in
// one feature — features must not import from each other. The same token model
// carries over to Flutter's Dio interceptor later.
"use client";

import { auth } from "@/lib/firebase";

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
