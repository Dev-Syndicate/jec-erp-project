// POST /api/students/[id]/enroll — place a student in a class for the active
// academic year (the "yearly sticker" attendance reads from). Super-Admin only,
// program-scoped. params is a Promise in Next 16 — await it.
//
// Upsert on (student, academic year): re-enrolling in the same year just moves
// them to a different class (fixing a mistake); next year is a new row (history).
// Promotion (bulk next-year enrollment) is a separate, later flow.
import { authenticate, assertProgramScope, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { STUDENT_INCLUDE, toStudentDto } from "../../dto";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as { classId?: unknown } | null;
    const classId = typeof body?.classId === "string" ? body.classId.trim() : "";
    if (!classId) return Response.json({ error: "Select a class." }, { status: 400 });

    const student = await db.student.findUnique({
      where: { id },
      include: { user: { select: { programId: true } } },
    });
    if (!student) return Response.json({ error: "Student not found." }, { status: 404 });
    assertProgramScope(ctx, student.user.programId);

    // The class must belong to the student's own program.
    const klass = await db.class.findUnique({ where: { id: classId }, select: { programId: true } });
    if (!klass) return Response.json({ error: "Select a valid class." }, { status: 400 });
    if (klass.programId !== student.user.programId) {
      return Response.json(
        { error: "That class is in a different program than the student." },
        { status: 400 },
      );
    }

    // Enrollment is scoped to the active academic year.
    const activeYear = await db.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!activeYear) {
      return Response.json(
        { error: "No academic year is active. Activate one before enrolling students." },
        { status: 400 },
      );
    }

    await db.enrollment.upsert({
      where: { studentId_academicYearId: { studentId: id, academicYearId: activeYear.id } },
      update: { classId },
      create: { studentId: id, classId, academicYearId: activeYear.id },
    });

    const updated = await db.student.findUniqueOrThrow({ where: { id }, include: STUDENT_INCLUDE });
    return Response.json(toStudentDto(updated));
  } catch (err) {
    return toAuthResponse(err);
  }
}
