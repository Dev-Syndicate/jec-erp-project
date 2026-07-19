// DELETE /api/teacher-assignments/[id] — remove a teacher assignment.
// Authorization: Super Admin (any dept) or HOD (own dept only).
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const { id } = await params;
    const row = await db.teacherAssignment.findUnique({ where: { id } });
    if (!row) return Response.json({ error: "Assignment not found." }, { status: 404 });
    assertDeptScope(ctx, row.departmentId);

    await db.teacherAssignment.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
