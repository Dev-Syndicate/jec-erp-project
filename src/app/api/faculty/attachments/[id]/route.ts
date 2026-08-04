// /api/faculty/attachments/[id] — end a cross-department loan.
//
// Super Admin only, matching the route that creates them. Note: params is a
// Promise in Next 16 — always await it.
//
// A hard delete is right here (unlike Class, which deactivates to keep history):
// an attachment is a live permission, not a record of something that happened.
// Removing it doesn't orphan anything — TimetableSlots written while it existed
// keep their facultyId and stay on the grid, because the teaching check runs when
// a cell is WRITTEN, not when it's read. The practical effect is that those cells
// can no longer be edited until the lecturer is re-attached, which is the same
// state they'd be in after a semester rollover.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNotFound } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "all");
    const { id } = await params;

    // Report how many slots this lecturer still holds in the host department, so
    // the UI can warn rather than let cover vanish silently. Counted BEFORE the
    // delete, since afterwards there's no attachment to tell us where to look.
    const attachment = await db.facultyAttachment.findUnique({
      where: { id },
      select: {
        semesterId: true,
        departmentId: true,
        faculty: { select: { userId: true } },
      },
    });
    if (!attachment) return Response.json({ error: "Attachment not found." }, { status: 404 });

    const strandedSlots = await db.timetableSlot.count({
      where: {
        facultyId: attachment.faculty.userId,
        semesterId: attachment.semesterId,
        class: { departmentId: attachment.departmentId },
      },
    });

    try {
      await db.facultyAttachment.delete({ where: { id } });
    } catch (e) {
      if (isNotFound(e)) return Response.json({ error: "Attachment not found." }, { status: 404 });
      throw e;
    }

    return Response.json({ ok: true, strandedSlots });
  } catch (err) {
    return toAuthResponse(err);
  }
}
