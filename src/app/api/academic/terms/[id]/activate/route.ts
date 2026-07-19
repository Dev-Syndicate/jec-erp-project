// POST /api/academic/terms/[id]/activate — make this the active term (semester).
//
// Exactly one term is active at a time: activating one deactivates the rest.
// Activating a term also activates its parent year (the active term must live in
// the active year). Super Admin only. This is the semester-rollover action.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");

    const { id } = await params;
    const term = await db.term.findUnique({ where: { id } });
    if (!term) return Response.json({ error: "Term not found." }, { status: 404 });

    await db.$transaction([
      // One active term globally.
      db.term.updateMany({ where: { isActive: true }, data: { isActive: false } }),
      db.term.update({ where: { id }, data: { isActive: true } }),
      // Keep the active year in sync with the active term's year.
      db.academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } }),
      db.academicYear.update({ where: { id: term.academicYearId }, data: { isActive: true } }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
