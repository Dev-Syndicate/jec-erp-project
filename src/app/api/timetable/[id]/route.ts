// DELETE /api/timetable/[id] — clear one timetable cell. Super-Admin only,
// program-scoped. params is a Promise in Next 16 — await it.
import { authenticate, assertProgramScope, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");
    const { id } = await params;

    const slot = await db.timetableSlot.findUnique({
      where: { id },
      include: { class: { select: { programId: true } } },
    });
    if (!slot) return Response.json({ error: "Slot not found." }, { status: 404 });
    assertProgramScope(ctx, slot.class.programId);

    await db.timetableSlot.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
