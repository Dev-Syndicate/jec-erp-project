// GET/POST /api/classes — list classes (with sections) for a department, and
// create a class. Classes/Sections are the org structure attendance targets.
//
// Authorization: Super Admin (any dept) or HOD (own dept only). Both GET and
// POST resolve the target department and dept-scope it.
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Resolve the department the request targets: Super Admin may pass any; an HOD is
// pinned to their own regardless of what's passed.
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

    const departmentId = resolveDeptId(ctx, new URL(req.url).searchParams.get("departmentId"));
    if (!departmentId) {
      return Response.json({ error: "A department is required." }, { status: 400 });
    }
    assertDeptScope(ctx, departmentId);

    const classes = await db.class.findMany({
      where: { departmentId },
      orderBy: { name: "asc" },
      include: { sections: { orderBy: { name: "asc" } } },
    });

    return Response.json({ classes });
  } catch (err) {
    return toAuthResponse(err);
  }
}

type CreateBody = { departmentId?: string; name?: string };

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const body = (await req.json().catch(() => null)) as CreateBody | null;
    const departmentId = resolveDeptId(ctx, body?.departmentId ?? null);
    const name = body?.name?.trim();
    if (!departmentId) return Response.json({ error: "A department is required." }, { status: 400 });
    if (!name) return Response.json({ error: "Class name is required." }, { status: 400 });
    assertDeptScope(ctx, departmentId);

    const clash = await db.class.findFirst({ where: { departmentId, name } });
    if (clash) {
      return Response.json({ error: `A class "${name}" already exists in this department.` }, { status: 409 });
    }

    const created = await db.class.create({
      data: { departmentId, name },
      include: { sections: true },
    });

    return Response.json({ class: created }, { status: 201 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
