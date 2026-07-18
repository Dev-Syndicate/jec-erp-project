// Auth hooks — the feature's data access (CLAUDE.md feature contract).
// Wraps Firebase client auth + our /api/auth/me profile behind TanStack Query.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User as FirebaseUser,
} from "firebase/auth";
import { useEffect, useState } from "react";

import { auth } from "@/lib/firebase";
import {
  clearMustChangePassword,
  fetchMe,
  resolveRegisterToEmail,
} from "@/features/auth/api/auth-api";

/** Tracks the raw Firebase sign-in state (independent of our profile). */
export function useFirebaseUser() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);
  return { firebaseUser: user, loading };
}

/** The resolved Neon profile for the signed-in user (roles, dept, flags). */
export function useMe(enabled: boolean) {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Sign in either way the PRD allows: staff use their email directly; students
 * type their register number, which we first resolve to their real email (the
 * Firebase identity) before signing in. Both paths end at the same credential.
 */
type SignInInput =
  | { kind: "email"; email: string; password: string }
  | { kind: "register"; registerNumber: string; password: string };

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SignInInput) => {
      const email =
        input.kind === "register"
          ? await resolveRegisterToEmail(input.registerNumber)
          : input.email;
      return signInWithEmailAndPassword(auth, email, input.password);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => signOut(auth),
    onSuccess: () => qc.clear(),
  });
}

/**
 * First-login password reset: update the Firebase credential (server never sees
 * it), then clear the mustChangePassword flag in Neon. Both must succeed.
 */
export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (newPassword: string) => {
      if (!auth.currentUser) throw new Error("Not signed in.");
      await updatePassword(auth.currentUser, newPassword);
      await clearMustChangePassword();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
  });
}
