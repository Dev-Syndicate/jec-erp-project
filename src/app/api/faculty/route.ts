// GET /api/faculty — list staff (HOD / Teacher) for the faculty list.
//
// Dept-scoped: Super Admin sees all staff; HOD sees only their department.
// Excludes students (they have a Student row) and the Super Admin account.
// Returns the account anchor + designation so the list can show the title.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    // Staff = users who are NOT students and hold a staff role. HOD is scoped to
    // their own department; Super Admin sees all.
    const deptFilter = ctx.roles.includes("Super Admin")
      ? {}
      : { departmentId: ctx.user.departmentId ?? "__none__" };

    const users = await db.user.findMany({
      where: {
        ...deptFilter,
        student: null, // exclude students
        roles: { some: { role: { name: { in: ["HOD", "Teacher"] } } } },
      },
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        email: true,
        isActive: true,
        departmentId: true,
        department: { select: { name: true, code: true } },
        roles: { select: { role: { select: { name: true } } } },
        facultyProfile: { select: { designation: true, staffId: true } },
      },
    });

    return Response.json({
      faculty: users.map((u) => ({
        id: u.id,
        name: u.displayName,
        email: u.email,
        isActive: u.isActive,
        departmentId: u.departmentId,
        departmentName: u.department?.name ?? null,
        departmentCode: u.department?.code ?? null,
        roles: u.roles.map((r) => r.role.name),
        designation: u.facultyProfile?.designation ?? null,
        staffId: u.facultyProfile?.staffId ?? null,
      })),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
