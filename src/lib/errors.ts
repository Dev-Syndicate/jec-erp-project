// Turning a caught error into something worth showing a user.
//
// `apiFetch` (src/lib/api-client.ts) already does the important work: on a
// non-OK response it reads the body's `error` field and throws an Error
// carrying that message. Our API routes write those messages for humans
// ("This register number is already taken."), so for anything that reached us
// as an Error, the message IS the user-facing copy.
//
// Everything else — a network failure, a thrown string, an object from a
// library that doesn't subclass Error — has no message we'd want to surface,
// so it collapses to one generic line rather than leaking a stack or a
// `[object Object]`.
//
// This lived as a byte-identical private copy in 26 feature components before
// being pulled here. Note the ONE function that is deliberately not folded in:
// `errorMessage` in src/features/auth/components/login-form.tsx maps Firebase
// auth codes ("auth/invalid-credential" → "Check your details and try again")
// and intentionally merges wrong-identifier with wrong-password so the login
// form can't be used to enumerate accounts. Different job, different rules.

/** The message to show a user for a caught error, or a generic fallback. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}
