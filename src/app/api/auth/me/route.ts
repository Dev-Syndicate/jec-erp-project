// GET /api/auth/me — the authenticated user's profile.
//
// The canonical "am I logged in, and as whom" endpoint. The web/Flutter clients
// call it right after sign-in to learn the user's roles, program, and whether
// a password reset is still pending (mustChangePassword). Demonstrates the
// route shape: authenticate() first, then respond.
import { authenticate, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { user, roles, mustChangePassword, isInstitutionScoped } = await authenticate(req);
    // Is this user a class teacher (advises ≥1 active class)? Drives the "Day
    // attendance" nav — day-record correction is the class teacher's job; HOD/SA
    // reach it via their role instead, so this only matters for a plain Faculty.
    const advisedCount = await db.class.count({
      where: { advisorId: user.id, isActive: true },
    });
    return Response.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      programId: user.programId,
      roles,
      // Does this user span every program (an INSTITUTION-scoped role) or just
      // their own? Derived from the role's DB scope, so the client never has to
      // compare role-name strings to work it out (CLAUDE.md). Presentation only
      // — every route re-derives scope server-side.
      isInstitutionScoped,
      mustChangePassword,
      advisesClass: advisedCount > 0,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
