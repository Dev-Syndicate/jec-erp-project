// Server-side auth — step one of every API route: "who are you".
//
// Flow (CLAUDE.md security boundary): read the Bearer ID token → verify it with
// Firebase Admin → resolve the Neon User (with roles) that the firebaseUid links
// to. Authorization (CASL ability + dept/class scoping) is step two and happens
// in the route, built from the roles this returns.
//
// A verified token whose uid has no active User row is REJECTED — a Firebase
// identity alone grants nothing; the User row in Neon is what authorizes.
import "server-only";

import { db } from "@/lib/db";
import { verifyIdToken } from "@/lib/firebase-admin";

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

  const user = await db.user.findUnique({
    where: { firebaseUid: uid },
    include: { roles: { include: { role: true } } },
  });

  if (!user) throw new AuthError(403, "No account is provisioned for this identity.");
  if (!user.isActive) throw new AuthError(403, "This account is inactive.");

  return {
    user,
    uid,
    roles: user.roles.map((r) => r.role.name),
    mustChangePassword: user.mustChangePassword,
  };
}

// ---------------------------------------------------------------------------
// Coarse role checks — a STOPGAP until the CASL ability factory (src/lib/rbac)
// lands. CASL will replace these with permission+subject checks driven by the
// DB role→permission mapping. Until then, routes gate on role name + the same
// dept-scoping rule CASL will enforce. Keep the surface small so the swap is
// mechanical: routes call requireRole()/assertDeptScope(), not raw role strings.
// ---------------------------------------------------------------------------

export function hasRole(ctx: AuthContext, role: string): boolean {
  return ctx.roles.includes(role);
}

/** Throw 403 unless the user holds at least one of the given roles. */
export function requireRole(ctx: AuthContext, ...roles: string[]): void {
  if (!roles.some((r) => ctx.roles.includes(r))) {
    throw new AuthError(403, "You don't have permission to do this.");
  }
}

/**
 * Enforce department scoping the way CASL will: Super Admin is unscoped (any
 * department), everyone else may only act within their own department. Throws
 * 403 on a cross-department action by a non-Super-Admin.
 */
export function assertDeptScope(ctx: AuthContext, targetDepartmentId: string | null): void {
  if (ctx.roles.includes("Super Admin")) return; // no department filter
  if (!ctx.user.departmentId || ctx.user.departmentId !== targetDepartmentId) {
    throw new AuthError(403, "That's outside your department.");
  }
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
