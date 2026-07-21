// /api/subjects/[id] — update + delete one subject. Super-Admin only, program-
// scoped. params is a Promise in Next 16 — await it. The program a subject
// belongs to is structural and not editable here (delete + recreate to move it).
//
// Delete is deactivate-primary: hard delete only when nothing depends on the
// subject (faculty assignments, timetable slots, attendance, marks); otherwise a
// clean 409 telling the admin to deactivate instead.
import { authenticate, assertProgramScope, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNotFound, isUniqueViolation } from "@/lib/prisma-errors";
import { SUBJECT_INCLUDE, toSubjectDto } from "../dto";

export const dynamic = "force-dynamic";

type SubjectPatch = { name?: string; code?: string; semesterNumber?: number; isActive?: boolean };

function parsePatchBody(body: unknown): { data: SubjectPatch } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;
  const data: SubjectPatch = {};

  if (b.name !== undefined) {
    const v = typeof b.name === "string" ? b.name.trim() : "";
    if (!v) return { error: "Name can't be empty." };
    data.name = v;
  }
  if (b.code !== undefined) {
    const v = typeof b.code === "string" ? b.code.trim() : "";
    if (!v) return { error: "Code can't be empty." };
    data.code = v;
  }
  if (b.semesterNumber !== undefined) {
    const n = b.semesterNumber;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
      return { error: "Semester must be a whole number of 1 or more." };
    }
    data.semesterNumber = n;
  }
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") return { error: "isActive must be true or false." };
    data.isActive = b.isActive;
  }

  if (Object.keys(data).length === 0) return { error: "Nothing to update." };
  return { data };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const parsed = parsePatchBody(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    const existing = await db.subject.findUnique({
      where: { id },
      include: { program: { include: { degree: { select: { durationYears: true } } } } },
    });
    if (!existing) return Response.json({ error: "Subject not found." }, { status: 404 });
    assertProgramScope(ctx, existing.programId);

    // Re-bound semesterNumber against this subject's program duration.
    if (parsed.data.semesterNumber !== undefined) {
      const maxSemester = existing.program.degree.durationYears * 2;
      if (parsed.data.semesterNumber > maxSemester) {
        return Response.json(
          { error: `Semester must be between 1 and ${maxSemester} for this program.` },
          { status: 400 },
        );
      }
    }

    try {
      const updated = await db.subject.update({
        where: { id },
        data: parsed.data,
        include: SUBJECT_INCLUDE,
      });
      return Response.json(toSubjectDto(updated));
    } catch (e) {
      if (isNotFound(e)) return Response.json({ error: "Subject not found." }, { status: 404 });
      if (isUniqueViolation(e)) {
        return Response.json(
          { error: "A subject with that code already exists in this program." },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");
    const { id } = await params;

    const subject = await db.subject.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            facultyAssignments: true,
            timetableSlots: true,
            periodAttendance: true,
            internalMarks: true,
          },
        },
      },
    });
    if (!subject) return Response.json({ error: "Subject not found." }, { status: 404 });
    assertProgramScope(ctx, subject.programId);

    const dependents =
      subject._count.facultyAssignments +
      subject._count.timetableSlots +
      subject._count.periodAttendance +
      subject._count.internalMarks;
    if (dependents > 0) {
      return Response.json(
        { error: "This subject is in use (timetable, attendance or marks). Deactivate it instead." },
        { status: 409 },
      );
    }

    await db.subject.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
