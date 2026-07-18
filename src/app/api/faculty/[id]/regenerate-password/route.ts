// POST /api/faculty/[id]/regenerate-password — reset one staff member's
// temporary password and reveal it once. Used when the temp password was lost,
// mistyped, or the member can't log in. (id is the User id.)
//
// SAFETY: only allowed while the account is still on its temp password
// (mustChangePassword=true). If they've already set their own password, we
// refuse — regenerating would lock them out of their own account.
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
    const user = await db.user.findUnique({
      where: { id },
      include: { student: { select: { id: true } } },
    });
    if (!user || user.student) {
      // Not found, or it's a student (wrong endpoint).
      return Response.json({ error: "Faculty member not found." }, { status: 404 });
    }
    assertDeptScope(ctx, user.departmentId);

    if (!user.mustChangePassword) {
      return Response.json(
        {
          error:
            "This staff member has already set their own password. Regenerating would lock them out — ask them to use “forgot password” instead.",
        },
        { status: 409 },
      );
    }

    const tempPassword = await regenerateTempPassword({ id: user.id, firebaseUid: user.firebaseUid });

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: "faculty.regeneratePassword",
        entity: "User",
        entityId: user.id,
      },
    });

    return Response.json({ ok: true, tempPassword });
  } catch (err) {
    return toAuthResponse(err);
  }
}
