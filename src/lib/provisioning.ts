// Shared onboarding helper — generates the temporary password used when an
// admin provisions an account. The user is emailed this password and forced to
// reset it on first login (mustChangePassword); the admin never sets or keeps
// the real one (CLAUDE.md onboarding rule).
import "server-only";

import { randomBytes } from "node:crypto";

// A readable-ish temporary password with enough entropy to be safe as a
// one-time credential. Mixed case + digits so it satisfies common Firebase /
// policy minimums. Not meant to be memorised — it's replaced on first login.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generateTempPassword(length = 14): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
