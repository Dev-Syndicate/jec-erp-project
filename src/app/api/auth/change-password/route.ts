// POST /api/auth/change-password — clears the mustChangePassword flag.
//
// The actual credential change happens client-side via the Firebase SDK (the
// server never holds the password — CLAUDE.md onboarding rule). After that
// succeeds the client calls this to flip the Neon flag, completing the
// first-login reset. Authenticated: only the token owner can clear their flag.
import { authenticate, invalidateAuthUser, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { user, uid } = await authenticate(req);
    await db.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false },
    });
    // The client polls /api/auth/me right after this to leave the reset screen.
    // Drop the cached user so that next read reflects mustChangePassword=false
    // immediately instead of waiting out the auth-cache TTL.
    invalidateAuthUser(uid);
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
