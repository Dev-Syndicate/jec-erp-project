// GET /api/students/[id] — one student with their admission record, for the
// admission wizard to load existing values. Dept-scoped like the list.
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const { id } = await params;
    const student = await db.student.findUnique({
      where: { id },
      include: {
        user: { select: { displayName: true, email: true, departmentId: true } },
        profile: true,
        addresses: true,
        guardians: true,
        education: { orderBy: { createdAt: "asc" } },
        banks: { orderBy: { createdAt: "asc" } },
        documents: true,
      },
    });
    if (!student) return Response.json({ error: "Student not found." }, { status: 404 });
    assertDeptScope(ctx, student.user.departmentId);

    return Response.json({
      id: student.id,
      rollNumber: student.rollNumber,
      registerNumber: student.registerNumber,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      admissionStatus: student.admissionStatus,
      name: student.user.displayName,
      email: student.user.email,
      departmentId: student.user.departmentId,
      profile: student.profile,
      addresses: student.addresses,
      guardians: student.guardians,
      education: student.education,
      banks: student.banks,
      documents: student.documents,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
