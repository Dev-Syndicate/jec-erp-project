// PATCH /api/subjects/[id] — soft-delete toggle (activate / deactivate) a
// subject. On a syllabus revision, deactivate the old subject rather than
// deleting it, so historical term assignments stay intact.
//
// Authorization: Super Admin (any dept) or HOD (own dept only).
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Body = { isActive?: boolean };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const { id } = await params;
    const subject = await db.subject.findUnique({ where: { id } });
    if (!subject) return Response.json({ error: "Subject not found." }, { status: 404 });
    assertDeptScope(ctx, subject.departmentId);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (typeof body?.isActive !== "boolean") {
      return Response.json({ error: "isActive (boolean) is required." }, { status: 400 });
    }

    const updated = await db.subject.update({
      where: { id },
      data: { isActive: body.isActive },
    });

    return Response.json({ subject: updated });
  } catch (err) {
    return toAuthResponse(err);
  }
}
