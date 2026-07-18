// POST /api/students/[id]/regenerate-password — reset one student's temporary
// password and reveal it once. Used when a results file is lost, the password
// was mistyped, or a student can't log in.
//
// SAFETY: only allowed while the account is still on its temp password
// (mustChangePassword=true). If the student has already set their own password,
// we refuse — regenerating would lock them out of their own account.
//
// Authorization: Super Admin (any dept) or HOD (own dept only).
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
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
      include: { user: { select: { id: true, firebaseUid: true, departmentId: true, mustChangePassword: true } } },
    });
    if (!student) return Response.json({ error: "Student not found." }, { status: 404 });
    assertDeptScope(ctx, student.user.departmentId);

    if (!student.user.mustChangePassword) {
      return Response.json(
        {
          error:
            "This student has already set their own password. Regenerating would lock them out — ask them to use “forgot password” instead.",
        },
        { status: 409 },
      );
    }

    const tempPassword = await regenerateTempPassword({
      id: student.user.id,
      firebaseUid: student.user.firebaseUid,
    });

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: "student.regeneratePassword",
        entity: "Student",
        entityId: student.id,
      },
    });

    return Response.json({ ok: true, tempPassword });
  } catch (err) {
    return toAuthResponse(err);
  }
}
