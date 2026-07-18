// Firebase Admin singleton — server-side identity verification & provisioning.
//
// Firebase = identity; our API + Neon = authorization + data (CLAUDE.md's
// security boundary). This module is the ONLY place the Admin SDK lives. It:
//   - verifies the per-user ID tokens clients send  ("who are you")
//   - provisions Firebase accounts during onboarding (admin creates account,
//     temp password emailed, mustChangePassword forces a reset)
//
// The service-account private key is a SERVER-SIDE SECRET. This file is never
// importable from client code (no NEXT_PUBLIC_ vars, server-only marker).
import "server-only";

import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — Firebase Admin cannot initialise.`);
  return value;
}

function createApp(): App {
  // The private key is stored on one line with literal "\n"; restore newlines.
  const privateKey = requireEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");
  return initializeApp({
    credential: cert({
      projectId: requireEnv("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: requireEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey,
    }),
  });
}

// Reuse the app across hot-reloads / warm invocations — Admin throws if the
// default app is initialised twice.
const app = getApps()[0] ?? createApp();

export const adminAuth = getAuth(app);

/**
 * Verify a Firebase ID token sent by a client. Returns the decoded token
 * (contains the uid) or throws if invalid/expired. This is step one of every
 * API route: "who are you" — authorization (CASL) happens after, in the route.
 */
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken> {
  return adminAuth.verifyIdToken(idToken);
}

/**
 * Provision a Firebase identity for onboarding: admin creates the account, we
 * generate a temp password, the user is forced to reset it on first login
 * (mustChangePassword lives on the Neon User row). The password is returned to
 * the caller so it can be delivered to the user's real inbox — the admin never
 * sets or keeps the real one (CLAUDE.md onboarding rule). Returns the new uid.
 */
export async function createFirebaseUser(args: {
  email: string;
  password: string;
  displayName: string;
}): Promise<string> {
  const user = await adminAuth.createUser(args);
  return user.uid;
}

/**
 * Delete a Firebase identity. Used to roll back a half-created account when the
 * Neon side of provisioning fails, so a retry doesn't collide on the email.
 */
export async function deleteFirebaseUser(uid: string): Promise<void> {
  await adminAuth.deleteUser(uid);
}

/**
 * Reset a Firebase user's password to a new value. Used when regenerating a
 * temporary password (results file lost, or one-off reset) — the caller pairs
 * this with re-setting mustChangePassword=true so first login forces a reset
 * again. Only ever called for accounts still on their temp password. We never
 * store the plaintext; it's revealed once to the admin and discarded.
 */
export async function resetFirebasePassword(uid: string, password: string): Promise<void> {
  await adminAuth.updateUser(uid, { password });
}
