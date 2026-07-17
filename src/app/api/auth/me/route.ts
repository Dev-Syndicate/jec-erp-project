// GET /api/auth/me — the authenticated user's profile.
//
// The canonical "am I logged in, and as whom" endpoint. The web/Flutter clients
// call it right after sign-in to learn the user's roles, department, and whether
// a password reset is still pending (mustChangePassword). Demonstrates the
// route shape: authenticate() first, then respond.
import { authenticate, toAuthResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { user, roles, mustChangePassword } = await authenticate(req);
    return Response.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      departmentId: user.departmentId,
      roles,
      mustChangePassword,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
