// POST /api/classes/[id]/sections — add a section (e.g. "A") to a class.
// Authorization: Super Admin (any dept) or HOD (own dept only — checked via the
// class's department).
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type CreateBody = { name?: string };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const { id } = await params;
    const cls = await db.class.findUnique({ where: { id } });
    if (!cls) return Response.json({ error: "Class not found." }, { status: 404 });
    assertDeptScope(ctx, cls.departmentId);

    const body = (await req.json().catch(() => null)) as CreateBody | null;
    const name = body?.name?.trim();
    if (!name) return Response.json({ error: "Section name is required." }, { status: 400 });

    const clash = await db.section.findFirst({ where: { classId: id, name } });
    if (clash) {
      return Response.json({ error: `Section "${name}" already exists in this class.` }, { status: 409 });
    }

    const section = await db.section.create({ data: { classId: id, name } });
    return Response.json({ section }, { status: 201 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
