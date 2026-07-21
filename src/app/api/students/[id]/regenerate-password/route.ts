// POST /api/students/[id]/regenerate-password — reissue a one-time temp password
// for a student who hasn't logged in yet (results file lost, etc.). Super-Admin
// only, program-scoped. Returns the new password, revealed once.
//
// Only valid while the student is still on their temp password (mustChangePassword
// = true). Once they've set their own, regenerating is refused — that's a proper
// account-recovery flow, not this admin convenience (matches provisioning.ts).
import { authenticate, assertProgramScope, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { regenerateTempPassword } from "@/lib/provisioning";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");
    const { id } = await params;

    const student = await db.student.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firebaseUid: true, programId: true, mustChangePassword: true } },
      },
    });
    if (!student) return Response.json({ error: "Student not found." }, { status: 404 });
    assertProgramScope(ctx, student.user.programId);

    if (!student.user.mustChangePassword) {
      return Response.json(
        { error: "This student has already set their own password, so a temp can't be reissued." },
        { status: 409 },
      );
    }

    const tempPassword = await regenerateTempPassword({
      id: student.user.id,
      firebaseUid: student.user.firebaseUid,
    });

    return Response.json({ tempPassword });
  } catch (err) {
    return toAuthResponse(err);
  }
}
