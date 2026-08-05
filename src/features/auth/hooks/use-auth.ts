// Auth hooks — the feature's data access (CLAUDE.md feature contract).
// Wraps Firebase client auth + our /api/auth/me profile behind TanStack Query.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
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
 *
 * The two doors are kept separate: a student who knows their email would
 * otherwise authenticate fine through the Staff tab, so after a staff sign-in we
 * check the resolved profile and sign straight back out if it's a Student. This
 * is UX steering, NOT a privilege boundary — Firebase auth happens client-side,
 * and every API route re-derives authorization server-side regardless of which
 * tab was used. It exists so students land on the door that asks for the
 * identifier they actually have (their register number).
 */
type SignInInput =
  | { kind: "email"; email: string; password: string }
  | { kind: "register"; registerNumber: string; password: string };

export class WrongSignInTabError extends Error {
  constructor() {
    super("Students sign in with their register number — use the Student tab.");
    this.name = "WrongSignInTabError";
  }
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SignInInput) => {
      const email =
        input.kind === "register"
          ? await resolveRegisterToEmail(input.registerNumber)
          : input.email;
      const credential = await signInWithEmailAndPassword(auth, email, input.password);

      // Staff door: reject a student account before the session is handed over.
      // (The student door can't hit the inverse — resolve-roll only ever returns
      // an email for a row in the Student table.)
      if (input.kind === "email") {
        const me = await fetchMe().catch(() => null);
        if (me?.roles.includes("Student")) {
          await signOut(auth);
          qc.removeQueries({ queryKey: ["auth", "me"] });
          throw new WrongSignInTabError();
        }
      }
      return credential;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
  });
}

/**
 * Send a Firebase password-reset email. Staff pass their email; students pass a
 * register number we first resolve to the Firebase email (same as sign-in).
 *
 * Non-enumeration (matches /api/auth/resolve-roll's stance): an unknown account
 * must be indistinguishable from a real send, so a failed register lookup and
 * Firebase's user-not-found/invalid-email are swallowed and reported as success.
 * Only operational errors the user can act on (network, rate-limit) surface.
 */
type ResetInput =
  | { kind: "email"; email: string }
  | { kind: "register"; registerNumber: string };

// Where the reset link lands once the password has been changed.
//
// Without this Firebase sends people to <project>.firebaseapp.com — a domain
// they have never seen, in a password-reset email. That is the shape of a
// phishing link, and it is one of the reasons Gmail files these as spam.
// Returning them to our own /login keeps the whole flow on one domain.
//
// Read from the BROWSER first so previews and localhost work with no config,
// falling back to NEXT_PUBLIC_SITE_URL when there is no window. NOTE: whichever
// host ends up here must be listed under Firebase Auth → Settings → Authorised
// domains, or Firebase rejects the call (handled below).
const resetContinueUrl = () => {
  const origin =
    typeof window === "undefined"
      ? (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")
      : window.location.origin;
  // No origin to build on — let Firebase use its own default rather than send a
  // malformed "/login".
  return origin ? `${origin}/login` : undefined;
};

export function useSendPasswordReset() {
  return useMutation({
    mutationFn: async (input: ResetInput) => {
      const email =
        input.kind === "register"
          ? await resolveRegisterToEmail(input.registerNumber).catch(() => null)
          : input.email;
      if (!email) return; // unknown register number — stay generic, don't leak
      const continueUrl = resetContinueUrl();
      try {
        try {
          await sendPasswordResetEmail(
            auth,
            email,
            // Omit the settings object entirely when there is no origin to
            // return to — `{ url: undefined }` is rejected by Firebase.
            continueUrl
              ? {
                  url: continueUrl,
                  // Firebase handles the reset form itself and then continues to
                  // `url`. True would require our own /reset page to consume the
                  // oobCode, which does not exist yet.
                  handleCodeInApp: false,
                }
              : undefined,
          );
        } catch (e) {
          // Firebase rejects a continue URL whose host is not allowlisted under
          // Auth → Settings → Authorised domains. Falling back to the plain send
          // keeps the flow WORKING (Firebase's own hosted page) instead of
          // failing outright — a worse outcome than the unbranded landing page
          // this was meant to replace. Deploying to a new domain would otherwise
          // silently break account recovery for everyone.
          const code =
            e && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code : "";
          if (code !== "auth/unauthorized-continue-uri" && code !== "auth/invalid-continue-uri") throw e;
          console.warn(
            `[auth] ${continueUrl} is not an authorised Firebase domain — password-reset ` +
              `links will land on Firebase's hosted page instead. Add the host under ` +
              `Auth → Settings → Authorised domains.`,
          );
          await sendPasswordResetEmail(auth, email);
        }
      } catch (e) {
        const code =
          e && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code : "";
        if (code !== "auth/user-not-found" && code !== "auth/invalid-email") throw e;
      }
    },
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
