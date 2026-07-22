// The CASL ability factory — the authorization engine. It turns the DB
// role→permission grants (which the /access console edits) into an enforceable
// ability. `authenticate()` builds one per request from the user's grants; routes
// ask it via `authorize(ctx, action, subject, resource?)`.
//
// The permission vocabulary is CASL-shaped `(action, subject)` pairs, seeded in
// prisma/seed.ts: e.g. `mark Attendance`, `manage Student`, and the Super Admin
// wildcard `manage all`. CASL gives the wildcard semantics for free — a `manage`
// grant covers every action on that subject, and the `all` subject covers every
// subject — so `manage all` = full access.
//
// PROGRAM SCOPING lives in the ability as a CASL *condition*: a grant from a
// PROGRAM-scoped role is `can(action, subject, { programId: <the user's> })`, so
// it only applies to resources in that program. Grants from an INSTITUTION role
// (Super Admin) are unconditional. `authorize` enforces the condition by passing
// the resource instance (see src/lib/auth.ts).
import "server-only";

import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";

// Actions and subjects are open-ended strings (the catalog is DB-driven). The
// subject side also accepts a resource instance (a plain object carrying the
// fields conditions match on, e.g. `{ programId }`) so instance-level checks work.
export type AppAbility = MongoAbility<[string, string | Record<PropertyKey, unknown>]>;

// A single grant: an (action, subject) pair, optionally scoped by conditions the
// matching resource must satisfy (e.g. `{ programId }` for a PROGRAM role).
export type Grant = {
  action: string;
  subject: string;
  conditions?: Record<string, unknown>;
};

/**
 * Build an ability from a user's flattened permission grants. CASL handles the
 * `manage`/`all` wildcards; `conditions` (when present) scope a grant to matching
 * resource instances.
 */
export function defineAbilityFor(grants: Grant[]): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  for (const g of grants) can(g.action, g.subject, g.conditions);
  return build();
}
