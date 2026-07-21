// /api/roles — the roles assignable to a staff (faculty) account. RBAC is
// configurable data: the seeded roles (HOD, Faculty, …) plus any the admin
// creates later all live in the Role table, so this list is dynamic — the faculty
// form reads from here rather than a hardcoded Faculty/HOD toggle.
//
// It excludes INSTITUTION-scoped roles (Super Admin — bootstrap-only, never
// hand-assigned) and the seeded "Student" role (belongs to student accounts).
// Everything a program's staff can hold — including future custom roles — is
// PROGRAM-scoped and shows up here automatically.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    // Same audience as faculty provisioning (Super Admin + HOD).
    authorize(ctx, "read", "Faculty");

    const roles = await db.role.findMany({
      where: { scope: "PROGRAM", name: { not: "Student" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, scope: true },
    });

    return Response.json(roles);
  } catch (err) {
    return toAuthResponse(err);
  }
}
