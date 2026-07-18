// GET /api/faculty/[id] — one staff member with their faculty profile, for the
// profile view/edit page. Dept-scoped like the list.
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const { id } = await params;
    const user = await db.user.findUnique({
      where: { id },
      include: {
        department: { select: { name: true, code: true } },
        roles: { select: { role: { select: { name: true } } } },
        facultyProfile: true,
        student: { select: { id: true } },
      },
    });
    if (!user || user.student) {
      // Not found, or it's a student (wrong endpoint).
      return Response.json({ error: "Faculty member not found." }, { status: 404 });
    }
    assertDeptScope(ctx, user.departmentId);

    return Response.json({
      id: user.id,
      name: user.displayName,
      email: user.email,
      isActive: user.isActive,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
      departmentCode: user.department?.code ?? null,
      roles: user.roles.map((r) => r.role.name),
      profile: user.facultyProfile
        ? {
            designation: user.facultyProfile.designation,
            staffId: user.facultyProfile.staffId,
            phone: user.facultyProfile.phone,
            emergencyPhone: user.facultyProfile.emergencyPhone,
            gender: user.facultyProfile.gender,
            dateOfBirth: user.facultyProfile.dateOfBirth,
            maritalStatus: user.facultyProfile.maritalStatus,
            fatherName: user.facultyProfile.fatherName,
            motherName: user.facultyProfile.motherName,
          }
        : null,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
