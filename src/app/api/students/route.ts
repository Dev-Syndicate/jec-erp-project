// GET /api/students — list students (for the admin students list).
//
// Dept-scoped: Super Admin sees all; HOD sees only their department. Returns the
// anchor + admission status so the list can show who's still a DRAFT.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    // Super Admin: all. HOD: their department only (via the backing User).
    const where = ctx.roles.includes("Super Admin")
      ? {}
      : { user: { departmentId: ctx.user.departmentId ?? "__none__" } };

    const students = await db.student.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        rollNumber: true,
        registerNumber: true,
        admissionStatus: true,
        user: { select: { displayName: true, email: true, departmentId: true, isActive: true } },
      },
    });

    return Response.json({
      students: students.map((s) => ({
        id: s.id,
        rollNumber: s.rollNumber,
        registerNumber: s.registerNumber,
        admissionStatus: s.admissionStatus,
        name: s.user.displayName,
        email: s.user.email,
        departmentId: s.user.departmentId,
        isActive: s.user.isActive,
      })),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
