// DELETE /api/working-days/[id] — undo a working-Saturday declaration (the
// college cancelled it). Super Admin only, matching the declare route.
//
// Attendance already marked for that date is NOT deleted: the classes happened,
// and the records key on the real date, not on this row. Removing the
// declaration only stops FURTHER marking — resolveWeekday will treat the date as
// a holiday again. If marks were entered by mistake, correct them on the day
// record rather than expecting this to cascade.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNotFound } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(_req);
    authorize(ctx, "manage", "all");
    const { id } = await params;

    const existing = await db.workingDay.findUnique({ where: { id }, select: { date: true } });
    if (!existing) return Response.json({ error: "Working day not found." }, { status: 404 });

    // Warn (don't block) when attendance already exists for the date, so the
    // admin knows records are being left behind.
    const marked = await db.periodAttendance.count({ where: { date: existing.date } });

    try {
      await db.workingDay.delete({ where: { id } });
    } catch (e) {
      if (isNotFound(e)) return Response.json({ error: "Working day not found." }, { status: 404 });
      throw e;
    }

    return Response.json({ deleted: true, attendanceRecords: marked });
  } catch (err) {
    return toAuthResponse(err);
  }
}
