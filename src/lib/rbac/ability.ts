// The CASL ability factory — Pass B of authorization. This turns the DB
// role→permission grants (which the /access console edits) into an enforceable
// ability, replacing the requireRole role-name stopgap. `authenticate()` builds
// one of these per request from the user's granted permissions; routes ask it
// `authorize(ctx, action, subject)`.
//
// The permission vocabulary is CASL-shaped `(action, subject)` pairs, seeded in
// prisma/seed.ts: e.g. `mark Attendance`, `manage Student`, and the Super Admin
// wildcard `manage all`. CASL gives us the wildcard semantics for free — a
// `manage` grant covers every action on that subject, and the `all` subject
// covers every subject — so `manage all` = full access.
//
// NOTE: program scoping (a HOD acts only within their own program) is still
// enforced separately by `assertProgramScope` in the routes, not by CASL
// conditions. Folding that into instance-level ability conditions is a later
// refinement; this pass swaps the coarse role check for the data-driven grant
// check.
import "server-only";

import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";

// Actions and subjects are open-ended strings (the catalog is DB-driven), so the
// ability is typed on the loose `[action, subject]` tuple rather than a closed union.
export type AppAbility = MongoAbility<[string, string]>;

export type Grant = { action: string; subject: string };

/**
 * Build an ability from a user's flattened permission grants. Each grant is a
 * plain `can(action, subject)`; CASL handles the `manage`/`all` wildcards.
 */
export function defineAbilityFor(grants: Grant[]): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  for (const g of grants) can(g.action, g.subject);
  return build();
}
