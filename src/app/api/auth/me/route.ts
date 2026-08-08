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
    // Two independent questions about what this user actually does, issued
    // together — each sequential await would cost its own ~90ms Neon round-trip.
    //
    //  · advisesClass — is this a class teacher (advises ≥1 active class)? Drives
    //    the "Day attendance" nav; day-record correction is the class teacher's
    //    job, and HOD/SA reach it via their role instead.
    //  · teaches — do they hold ≥1 timetable slot this semester? A HOD who takes
    //    no hours has nothing to mark, so the marking nav is hidden from them.
    //    Same definition as /api/me/staff-overview, so the two agree.
    const activeSemester = await db.semester.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    const [advisedCount, teachingSlotCount] = await Promise.all([
      db.class.count({ where: { advisorId: user.id, isActive: true } }),
      activeSemester
        ? db.timetableSlot.count({
            where: { facultyId: user.id, semesterId: activeSemester.id },
          })
        : Promise.resolve(0),
    ]);
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
      teaches: teachingSlotCount > 0,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
