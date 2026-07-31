// Helpers for building an AuthContext without authenticating.
//
// `authorize(ctx, ...)` only ever reads `ctx.ability`, so a test can hand it a
// context built from grants directly — no Firebase token, no Neon lookup. These
// mirror the three role shapes the app actually issues (see
// docs/PROJECT-GUIDE.md §3).
import { defineAbilityFor, type Grant } from "@/lib/rbac/ability";
import type { AuthContext } from "@/lib/auth";

/** Wrap grants in the minimal shape `authorize`/`can` read. */
export function ctxFrom(grants: Grant[], isInstitutionScoped = false): AuthContext {
  return {
    ability: defineAbilityFor(grants),
    isInstitutionScoped,
  } as unknown as AuthContext;
}

/** Super Admin: the INSTITUTION wildcard, unconditional. */
export function superAdminCtx(): AuthContext {
  return ctxFrom([{ action: "manage", subject: "all" }], true);
}

/**
 * A PROGRAM-scoped role (HOD, Faculty, …). Every grant carries the
 * `{ programId }` CASL condition, which is what confines them to their own program.
 */
export function programCtx(programId: string, pairs: Array<[string, string]>): AuthContext {
  return ctxFrom(
    pairs.map(([action, subject]) => ({ action, subject, conditions: { programId } })),
    false,
  );
}
