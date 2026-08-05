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
      // The employment axis: which department employs this person, and which
      // awards that department runs. Both ride the existing 30s cache rather than
      // costing a second round-trip per request.
      facultyProfile: {
        select: {
          departmentId: true,
          department: { select: { programs: { select: { id: true } } } },
        },
      },
    },
  });
}

/** The subset of a loaded user that scope derivation needs. */
export type GrantUser = {
  programId: string | null;
  facultyProfile: {
    departmentId: string;
    department: { programs: Array<{ id: string }> };
  } | null;
};

export type Scopes = {
  /** The department that employs this user. Null for students. */
  departmentId: string | null;
  /** The awards this user's department runs — their ADMINISTRATIVE reach. */
  ownProgramIds: string[];
};

/**
 * Derive a user's scopes from their loaded record.
 *
 * Extracted as a pure function (rather than left inline in `authenticate`) so the
 * unit suite can exercise it — Vitest cannot reach the DB, so anything embedded in
 * the authenticated request path is untestable by construction.
 *
 * The branch on `facultyProfile` is load-bearing, not defensive. A student has no
 * department, so deriving their scope from one would yield an empty set and lock
 * them out of their own records entirely — students keep `User.programId` as their
 * scope, and only staff resolve through a department.
 *
 * A staff member's reach is DERIVED from their department rather than stored, which
 * is why one HOD covers every award their department runs — B.E-CIVIL and
 * B.E-STRUCT alike — instead of a single stored programId.
 */
export function scopesFor(user: GrantUser): Scopes {
  const profile = user.facultyProfile;

  const ownProgramIds = profile
    ? profile.department.programs.map((p) => p.id) // staff: via their department
    : user.programId
      ? [user.programId] // student: their own program
      : [];

  return { departmentId: profile?.departmentId ?? null, ownProgramIds };
}

/** A role's granted permissions, in the shape grant-building needs. */
export type GrantRoles = Array<{
  role: {
    scope: string;
    permissions: Array<{ permission: { action: string; subject: string } }>;
  };
}>;

/**
 * Flatten every role's granted permissions into CASL grants, conditioned on the
 * axis the SUBJECT is scoped by. Pure, so the unit suite can pin the rules.
 *
 * Two axes, because two different questions scope different subjects:
 *
 *   DEPARTMENT (`{ departmentId }`) — scoped by WHO OWNS IT.
 *     `Faculty`, because a staff member is scoped by who EMPLOYS them: an S&H HOD
 *     manages S&H staff even though S&H runs no award.
 *     Everything hanging off a CLASS — `Class`, `Student`, `Attendance`,
 *     `Timetable`, `Marks`, `Leave` — because the class's owning department runs
 *     it. **This is the rule that hides first-years from a branch HOD**: a
 *     year-1 class is owned by S&H, so it simply isn't in a CSE HOD's scope, and
 *     nothing has to remember to exclude it.
 *
 *   ACADEMIC (`{ programId: { $in: ownProgramIds } }`) — scoped by WHICH AWARD.
 *     Structural catalogue records that belong to a degree rather than to a class:
 *     `Program`, `Subject`, `Degree`, `Branch`, `AcademicYear`, `Semester`.
 *
 * `Student` is on the DEPARTMENT axis deliberately (it was on the academic one):
 * a student's department is DERIVED from whichever department owns their currently
 * enrolled class, so a first-year sits in S&H and moves to their branch at
 * promotion. Their award never changes — that's `Student.programId` — but it is
 * not what scopes access.
 *
 * Both empty cases fail closed. A PROGRAM role with no department matches nothing
 * via the `__none__` sentinel (a null condition would otherwise match
 * null-department resources), and an empty `ownProgramIds` gives `$in: []`, which
 * matches nothing on its own.
 */

/**
 * Subjects scoped by the DEPARTMENT that owns the record rather than by the award.
 *
 * An allow-list, not a deny-list: a new permission subject defaults to the academic
 * axis, which is the narrower, more conservative answer for a branch HOD. Adding a
 * class-owned subject here is a deliberate act.
 */
const DEPARTMENT_SCOPED = new Set([
  "Faculty", // employment — who pays them
  "Class", // the owner is the scoping key
  "Student", // derived from the class they're enrolled in
  "Attendance",
  "Timetable",
  "Marks",
  "Leave",
]);

export function buildGrants(user: GrantUser & { roles: GrantRoles }): Grant[] {
  const { departmentId, ownProgramIds } = scopesFor(user);

  return user.roles.flatMap((ur) =>
    ur.role.permissions.map((rp) => {
      const { action, subject } = rp.permission;
      if (ur.role.scope !== "PROGRAM") return { action, subject, conditions: undefined };

      return DEPARTMENT_SCOPED.has(subject)
        ? { action, subject, conditions: { departmentId: departmentId ?? "__none__" } }
        : { action, subject, conditions: { programId: { $in: ownProgramIds } } };
    }),
  );
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
  const grants = buildGrants(user);
  const scopes = scopesFor(user);

  return {
    user,
    uid,
    roles: user.roles.map((r) => r.role.name),
    // An INSTITUTION-scoped role (Super Admin) acts across every program; PROGRAM
    // roles are confined by the ability's conditions (still exposed as a flag for
    // the list `where` filters).
    isInstitutionScoped: user.roles.some((r) => r.role.scope === "INSTITUTION"),
    // The employment axis — who this user's department is. Use for `Faculty`
    // filters and for "which classes does my department own".
    departmentId: scopes.departmentId,
    // The academic axis — the awards their department runs. Use for
    // administrative list filters (a department may run several).
    ownProgramIds: scopes.ownProgramIds,
    ability: defineAbilityFor(grants),
    mustChangePassword: user.mustChangePassword,
  };
}

// ---------------------------------------------------------------------------
// Authorization (step two). `authorize` is the CASL-backed permission check that
// replaced the requireRole role-name stopgap: it asks the ability built from the
// user's DB grants whether they may perform `action` on `subject`. Passing a
// `resource` also enforces the grant's scope condition — folding what used to be a
// separate assertProgramScope call into the same check.
// ---------------------------------------------------------------------------

/**
 * The scope a resource carries, matching the axis its subject is scoped by:
 *
 *   `{ departmentId }` — a person, scoped by who employs them: the `Faculty`
 *                        subject, and anything a department OWNS (e.g. a Class).
 *   `{ programId }`    — a record, scoped by the award that owns it.
 *
 * A UNION rather than two optional fields on purpose: a resource carrying neither
 * then fails to type-check, instead of silently degrading to a capability-only
 * (unscoped) check — which is the trap the old optional `resource` argument set.
 */
export type ScopedResource =
  | { programId: string | null }
  | { departmentId: string | null };

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
  resource?: ScopedResource,
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
  resource?: ScopedResource,
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
