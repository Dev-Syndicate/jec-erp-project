// GET/POST /api/subjects — the subject catalog for a department. Subjects are a
// reusable, editable catalog tagged by curriculum semesterNumber (1-8). On a
// syllabus change, add new + deactivate old (never hard-delete), so term-scoped
// assignments keep pointing at what was taught.
//
// Authorization: Super Admin (any dept) or HOD (own dept only).
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function resolveDeptId(
  ctx: { roles: string[]; user: { departmentId: string | null } },
  passed: string | null,
): string | null {
  return ctx.roles.includes("Super Admin") ? passed : ctx.user.departmentId;
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const url = new URL(req.url);
    const departmentId = resolveDeptId(ctx, url.searchParams.get("departmentId"));
    if (!departmentId) return Response.json({ error: "A department is required." }, { status: 400 });
    assertDeptScope(ctx, departmentId);

    const includeInactive = url.searchParams.get("includeInactive") === "true";

    const subjects = await db.subject.findMany({
      where: { departmentId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ semesterNumber: "asc" }, { name: "asc" }],
    });

    return Response.json({ subjects });
  } catch (err) {
    return toAuthResponse(err);
  }
}

type CreateBody = { departmentId?: string; name?: string; code?: string; semesterNumber?: number };

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const body = (await req.json().catch(() => null)) as CreateBody | null;
    const departmentId = resolveDeptId(ctx, body?.departmentId ?? null);
    const name = body?.name?.trim();
    const code = body?.code?.trim().toUpperCase();
    const semesterNumber = Number(body?.semesterNumber);

    if (!departmentId) return Response.json({ error: "A department is required." }, { status: 400 });
    if (!name || !code) return Response.json({ error: "Name and code are required." }, { status: 400 });
    if (!Number.isInteger(semesterNumber) || semesterNumber < 1 || semesterNumber > 8) {
      return Response.json({ error: "Semester must be a number from 1 to 8." }, { status: 400 });
    }
    assertDeptScope(ctx, departmentId);

    const clash = await db.subject.findFirst({ where: { departmentId, code } });
    if (clash) {
      return Response.json({ error: `A subject with code "${code}" already exists in this department.` }, { status: 409 });
    }

    const subject = await db.subject.create({
      data: { departmentId, name, code, semesterNumber },
    });

    return Response.json({ subject }, { status: 201 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
