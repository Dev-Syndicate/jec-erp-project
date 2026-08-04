// DELETE /api/timetable/[id] — clear one timetable cell. Super-Admin only,
// department-scoped. params is a Promise in Next 16 — await it.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Timetable");
    const { id } = await params;

    const slot = await db.timetableSlot.findUnique({
      where: { id },
      include: { class: { select: { departmentId: true } } },
    });
    if (!slot) return Response.json({ error: "Slot not found." }, { status: 404 });
    // Owner runs the class: clearing a cell is scoped to the department that owns
    // the class, not its award (a year-1 grid belongs to S&H).
    authorize(ctx, "manage", "Timetable", { departmentId: slot.class.departmentId });

    await db.timetableSlot.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
