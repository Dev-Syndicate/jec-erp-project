// GET/POST /api/departments — list and create departments.
//
// Route shape (CLAUDE.md security boundary): authenticate → authorize → Prisma.
//
// Authorization (PRD scoping table):
//   - GET  → Super Admin sees all; an HOD sees only their own department.
//   - POST → Super Admin ONLY. Creating departments is the Super Admin's sole
//            authority (PRD line 138); no other role may.
//
// Uses the requireRole stopgap until the CASL ability factory (src/lib/rbac)
// lands, at which point these checks become permission+subject abilities.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);

    // Super Admin: all departments. Everyone else: their own department only
    // (an HOD/teacher scoped by departmentId; a user with none sees nothing).
    const where = ctx.roles.includes("Super Admin")
      ? {}
      : { id: ctx.user.departmentId ?? "__none__" };

    const departments = await db.department.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        _count: { select: { classes: true, users: true } },
      },
    });

    return Response.json({ departments });
  } catch (err) {
    return toAuthResponse(err);
  }
}

type CreateBody = { name?: string; code?: string };

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");

    const body = (await req.json().catch(() => null)) as CreateBody | null;
    const name = body?.name?.trim();
    // Codes are conventionally uppercase (CSE, ECE) and used as a short handle.
    const code = body?.code?.trim().toUpperCase();
    if (!name || !code) {
      return Response.json({ error: "Name and code are both required." }, { status: 400 });
    }

    // Pre-check for a friendly message; the unique constraints are the real guard.
    const clash = await db.department.findFirst({
      where: { OR: [{ name }, { code }] },
      select: { name: true, code: true },
    });
    if (clash) {
      const which = clash.code === code ? `code "${code}"` : `name "${name}"`;
      return Response.json({ error: `A department with that ${which} already exists.` }, { status: 409 });
    }

    const department = await db.department.create({
      data: { name, code },
      select: { id: true, name: true, code: true, isActive: true },
    });

    return Response.json({ department }, { status: 201 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
