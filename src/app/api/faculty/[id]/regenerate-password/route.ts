// POST /api/faculty/[id]/regenerate-password — reissue a one-time temp password
// for a faculty member who hasn't logged in yet (temp lost, etc.). Super-Admin
// only, program-scoped. Returns the new password, revealed once.
//
// Only valid while the faculty member is still on their temp password
// (mustChangePassword = true). Once they've set their own, regenerating is
// refused — that's a proper account-recovery flow, not this admin convenience.
import { authenticate, assertProgramScope, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { regenerateTempPassword } from "@/lib/provisioning";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Faculty");
    const { id } = await params;

    const faculty = await db.facultyProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firebaseUid: true, programId: true, mustChangePassword: true } },
      },
    });
    if (!faculty) return Response.json({ error: "Faculty not found." }, { status: 404 });
    assertProgramScope(ctx, faculty.user.programId);

    if (!faculty.user.mustChangePassword) {
      return Response.json(
        { error: "This faculty member has already set their own password, so a temp can't be reissued." },
        { status: 409 },
      );
    }

    const tempPassword = await regenerateTempPassword({
      id: faculty.user.id,
      firebaseUid: faculty.user.firebaseUid,
    });

    return Response.json({ tempPassword });
  } catch (err) {
    return toAuthResponse(err);
  }
}
