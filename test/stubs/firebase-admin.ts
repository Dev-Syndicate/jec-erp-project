// Test double for `@/lib/firebase-admin`.
//
// Unit tests never verify a real token — `authorize`/`can` operate on an ability we
// construct directly, well after authentication would have happened. Calling this
// means a test wandered into `authenticate()`, which needs real credentials and a
// real Neon lookup; fail loudly rather than hang on a network call.
export function verifyIdToken(): never {
  throw new Error(
    "Unit tests must not verify Firebase tokens. Build an AuthContext directly " +
      "(see test/helpers/ability.ts) instead of calling authenticate().",
  );
}
