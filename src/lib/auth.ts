// Server-side auth — step one of every API route: "who are you".
//
// Flow (CLAUDE.md security boundary): read the Bearer ID token → verify it with
// Firebase Admin → resolve the Neon User (with roles + granted permissions) that
// the firebaseUid links to. Authorization is step two (`authorize` in the route),
// built from the CASL ability this returns.
//
// A verified token whose uid has no active User row is REJECTED — a Firebase
// identity alone grants nothing; the User row in Neon is what authorizes.
import "server-only";

import { subject as asSubject } from "@casl/ability";

import { db } from "@/lib/db";
import { verifyIdToken } from "@/lib/firebase-admin";
import { defineAbilityFor, type Grant } from "@/lib/rbac/ability";

export class AuthError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// The authenticated context a route gets after auth succeeds.
export type AuthContext = Awaited<ReturnType<typeof authenticate>>;

// --- short-lived user cache ------------------------------------------------
// Every authenticated request resolves the Neon User (with roles) from the
// verified firebaseUid. On Neon's free tier that's a cross-region round-trip
// (~400ms warm) paid on EVERY request. Cache the resolved user briefly, keyed
// by uid, so back-to-back requests skip the DB lookup.
//
// TTL is deliberately short: role/department/active changes (e.g. HOD rotation,
// deactivation) must take effect quickly. 30s bounds the staleness window —
// worst case, a revoked role keeps working for up to 30s. For anything that
// must revoke instantly, call invalidateAuthUser(uid) after the mutation.
type CachedUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;
const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map<string, { user: CachedUser; expires: number }>();

function loadUser(uid: string) {
  return db.user.findUnique({
    where: { firebaseUid: uid },
    include: {
      // Roles carry their scope (for isInstitutionScoped) and their granted
      // permissions (which build the CASL ability).
      roles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
}

async function resolveUser(uid: string): Promise<CachedUser | null> {
  const now = Date.now();
  const hit = userCache.get(uid);
  if (hit && hit.expires > now) return hit.user;

  const user = await loadUser(uid);
  if (user) {
    userCache.set(uid, { user, expires: now + USER_CACHE_TTL_MS });
  } else {
    // Don't cache misses — a just-provisioned account should work immediately.
    userCache.delete(uid);
  }
  return user;
}

/**
 * Drop a user from the auth cache so their next request re-reads Neon. Call
 * after a mutation that must take effect immediately (role change, program
 * move, deactivation) instead of waiting out the TTL.
 */
export function invalidateAuthUser(uid: string): void {
  userCache.delete(uid);
}

function extractBearer(req: Request): string {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new AuthError(401, "Missing or malformed Authorization header.");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new AuthError(401, "Empty bearer token.");
  return token;
}

/**
 * Verify the request's Firebase ID token and resolve the linked Neon user.
 * Throws AuthError (401/403) on any failure — routes should catch and map it
 * to a response (see toAuthResponse).
 */
export async function authenticate(req: Request) {
  const token = extractBearer(req);

  let uid: string;
  try {
    ({ uid } = await verifyIdToken(token));
  } catch {
    throw new AuthError(401, "Invalid or expired token.");
  }

  const user = await resolveUser(uid);

  if (!user) throw new AuthError(403, "No account is provisioned for this identity.");
  if (user.status !== "ACTIVE") throw new AuthError(403, "This account is inactive.");

  // Flatten every role's granted permissions into the CASL ability. A grant from
  // a PROGRAM-scoped role is conditioned on the user's own programId (so it only
  // applies to resources in that program); INSTITUTION grants are unconditional.
  // Duplicate grants across roles are harmless (CASL collapses them).
  const grants: Grant[] = user.roles.flatMap((ur) =>
    ur.role.permissions.map((rp) => ({
      action: rp.permission.action,
      subject: rp.permission.subject,
      // A PROGRAM role with no programId must match NOTHING (fail closed, like the
      // old assertProgramScope's `!ctx.user.programId` guard) — a null condition
      // would otherwise match null-programId resources. The `__none__` sentinel is
      // the same fence the list `where` filters use.
      conditions:
        ur.role.scope === "PROGRAM" ? { programId: user.programId ?? "__none__" } : undefined,
    })),
  );

  return {
    user,
    uid,
    roles: user.roles.map((r) => r.role.name),
    // An INSTITUTION-scoped role (Super Admin) acts across every program; PROGRAM
    // roles are confined to their own program by the ability's programId conditions
    // (still exposed as a flag for the list `where` filters).
    isInstitutionScoped: user.roles.some((r) => r.role.scope === "INSTITUTION"),
    ability: defineAbilityFor(grants),
    mustChangePassword: user.mustChangePassword,
  };
}

// ---------------------------------------------------------------------------
// Authorization (step two). `authorize` is the CASL-backed permission check that
// replaced the requireRole role-name stopgap: it asks the ability built from the
// user's DB grants whether they may perform `action` on `subject`. Passing a
// `resource` also enforces the grant's program condition (a PROGRAM role acts only
// within its own program) — folding what used to be a separate assertProgramScope
// call into the same check.
// ---------------------------------------------------------------------------

/**
 * Throw 403 unless the user's granted permissions allow `action` on `subject`.
 *
 * Without `resource` this is a CAPABILITY check ("may this role do X at all?").
 * With `resource` (an object carrying `programId`) it is an INSTANCE check that
 * also enforces the grant's program condition — so a PROGRAM-scoped user is
 * confined to their own program, an INSTITUTION user (Super Admin) is not. Prefer
 * the resource form whenever the target's programId is known.
 *
 * `manage` covers every action on a subject and the `all` subject covers every
 * subject, so `authorize(ctx, "manage", "all")` means "must be a full/institution
 * admin". Reads the DB-driven grants — edits in the /access console take effect
 * (subject to the 30s auth cache; invalidateAuthUser for instant).
 */
export function authorize(
  ctx: AuthContext,
  action: string,
  subject: string,
  resource?: { programId: string | null },
): void {
  // asSubject tags the resource with its subject type so CASL evaluates the
  // grant's conditions against it (cast: the tag adds a hidden symbol prop).
  const target =
    resource === undefined
      ? subject
      : (asSubject(subject, resource) as unknown as Record<PropertyKey, unknown>);
  if (!ctx.ability.can(action, target)) {
    throw new AuthError(403, "You don't have permission to do this.");
  }
}

/**
 * The non-throwing form of {@link authorize} — the same capability/scoped check,
 * returning a boolean. Use when a route needs to BRANCH on a permission (e.g.
 * "is this user a program admin for marks?") rather than gate on it. Applies the
 * identical `asSubject` tagging so a scoped grant's `{ programId }` condition is
 * evaluated the same way.
 */
export function can(
  ctx: AuthContext,
  action: string,
  subject: string,
  resource?: { programId: string | null },
): boolean {
  const target =
    resource === undefined
      ? subject
      : (asSubject(subject, resource) as unknown as Record<PropertyKey, unknown>);
  return ctx.ability.can(action, target);
}

/** Map an AuthError (or unexpected error) to a JSON Response for a route. */
export function toAuthResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  // Never leak internals; log server-side and return a generic 500.
  console.error("Unexpected auth error:", err);
  return Response.json({ error: "Internal error." }, { status: 500 });
}
