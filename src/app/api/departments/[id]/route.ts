// PATCH/DELETE /api/departments/[id] — edit or deactivate one department.
//
// Route shape (CLAUDE.md security boundary): authenticate → authorize → Prisma.
// Both are Super Admin ONLY — managing departments is the Super Admin's sole
// authority (PRD line 138).
//
// DELETE is a SOFT delete: it flips isActive to false, never removes the row
// (CLAUDE.md: students/staff/org are marked inactive, never hard-deleted, so
// history and foreign keys stay intact).
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type PatchBody = { name?: string; code?: string; isActive?: boolean };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");

    const { id } = await params;
    const body = (await req.json().catch(() => null)) as PatchBody | null;
    if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });

    const existing = await db.department.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "Department not found." }, { status: 404 });

    const name = body.name?.trim();
    const code = body.code?.trim().toUpperCase();
    // Only fields actually supplied are changed; reactivation is allowed too.
    const data: PatchBody = {};
    if (name !== undefined) data.name = name;
    if (code !== undefined) data.code = code;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    if (data.name === "" || data.code === "") {
      return Response.json({ error: "Name and code can't be empty." }, { status: 400 });
    }

    // Friendly clash message; the unique constraints are the real guard.
    if (name || code) {
      const clash = await db.department.findFirst({
        where: {
          id: { not: id },
          OR: [...(name ? [{ name }] : []), ...(code ? [{ code }] : [])],
        },
        select: { name: true, code: true },
      });
      if (clash) {
        const which = clash.code === code ? `code "${code}"` : `name "${name}"`;
        return Response.json(
          { error: `Another department already uses that ${which}.` },
          { status: 409 },
        );
      }
    }

    const department = await db.department.update({
      where: { id },
      data,
      select: { id: true, name: true, code: true, isActive: true },
    });
    return Response.json({ department });
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");

    const { id } = await params;
    const existing = await db.department.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "Department not found." }, { status: 404 });

    // Soft delete — mark inactive, keep the row.
    const department = await db.department.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, name: true, code: true, isActive: true },
    });
    return Response.json({ department });
  } catch (err) {
    return toAuthResponse(err);
  }
}
