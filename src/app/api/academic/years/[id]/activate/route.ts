// POST /api/academic/years/[id]/activate — make this the active academic year.
//
// Exactly one year is active at a time: activating one deactivates the rest in a
// transaction. Super Admin only.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");

    const { id } = await params;
    const year = await db.academicYear.findUnique({ where: { id } });
    if (!year) return Response.json({ error: "Academic year not found." }, { status: 404 });

    await db.$transaction([
      db.academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } }),
      db.academicYear.update({ where: { id }, data: { isActive: true } }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
