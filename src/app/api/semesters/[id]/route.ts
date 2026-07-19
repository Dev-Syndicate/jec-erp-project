// /api/semesters/[id] — update dates + delete one semester. Super-Admin only.
// Kind and parent year are structural and not editable here (delete + recreate to
// change them). params is a Promise in Next 16 — await it.
//
// Delete is guarded: the active semester can't be deleted, nor one that already
// has records (attendance / marks / timetable / assignments) hanging off it.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNotFound } from "@/lib/prisma-errors";
import { SEMESTER_INCLUDE, toSemesterDto } from "../../academic-years/dto";

export const dynamic = "force-dynamic";

// Edit only touches the date window; both dates are required and ordered.
function parseSemesterPatchBody(
  body: unknown,
): { data: { startDate: Date; endDate: Date } } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const start = typeof b.startDate === "string" ? new Date(b.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) return { error: "Start date is invalid." };

  const end = typeof b.endDate === "string" ? new Date(b.endDate) : null;
  if (!end || Number.isNaN(end.getTime())) return { error: "End date is invalid." };

  if (start >= end) return { error: "Start date must be before the end date." };

  return { data: { startDate: start, endDate: end } };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const parsed = parseSemesterPatchBody(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    try {
      const updated = await db.semester.update({
        where: { id },
        data: parsed.data,
        include: SEMESTER_INCLUDE,
      });
      return Response.json(toSemesterDto(updated));
    } catch (e) {
      if (isNotFound(e)) return Response.json({ error: "Semester not found." }, { status: 404 });
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");
    const { id } = await params;

    const semester = await db.semester.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            facultyAssignments: true,
            timetableSlots: true,
            masterAttendance: true,
            periodAttendance: true,
            internalMarks: true,
          },
        },
      },
    });
    if (!semester) return Response.json({ error: "Semester not found." }, { status: 404 });
    if (semester.isActive) {
      return Response.json(
        { error: "This is the active semester. Activate another before deleting it." },
        { status: 409 },
      );
    }
    const dependents =
      semester._count.facultyAssignments +
      semester._count.timetableSlots +
      semester._count.masterAttendance +
      semester._count.periodAttendance +
      semester._count.internalMarks;
    if (dependents > 0) {
      return Response.json(
        { error: "This semester has records (attendance, marks or timetable) and can't be deleted." },
        { status: 409 },
      );
    }

    await db.semester.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
