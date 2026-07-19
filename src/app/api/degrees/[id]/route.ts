// /api/degrees/[id] — update + delete a single Degree. Super-Admin only (Structure
// is INSTITUTION-scoped). Note: params is a Promise in Next 16 — always await it.
//
// Delete semantics (decided from the schema): the primary "remove" is a
// deactivate (PATCH { isActive: false }), which keeps history. A true DELETE is
// allowed only when the Degree has no Programs — otherwise the FK would restrict
// it, so we return a clean 409 telling the admin to deactivate instead.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNotFound, isUniqueViolation } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

const MAX_DURATION_YEARS = 10;

// Parse a PATCH body: every field optional, but any field present must be valid.
// Returns only the keys that were supplied, so we never overwrite with undefined.
type DegreePatch = { name?: string; code?: string; durationYears?: number; isActive?: boolean };

function parsePatchBody(body: unknown): { data: DegreePatch } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;
  const data: DegreePatch = {};

  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) return { error: "Name can't be empty." };
    data.name = name;
  }

  if (b.code !== undefined) {
    const code = typeof b.code === "string" ? b.code.trim() : "";
    if (!code) return { error: "Code can't be empty." };
    data.code = code;
  }

  if (b.durationYears !== undefined) {
    const d = b.durationYears;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > MAX_DURATION_YEARS) {
      return { error: `Duration must be a whole number of years (1–${MAX_DURATION_YEARS}).` };
    }
    data.durationYears = d;
  }

  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") return { error: "isActive must be true or false." };
    data.isActive = b.isActive;
  }

  if (Object.keys(data).length === 0) return { error: "Nothing to update." };
  return { data };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const parsed = parsePatchBody(body);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    try {
      const updated = await db.degree.update({
        where: { id },
        data: parsed.data,
        include: { _count: { select: { programs: true } } },
      });
      return Response.json({
        id: updated.id,
        name: updated.name,
        code: updated.code,
        durationYears: updated.durationYears,
        isActive: updated.isActive,
        programCount: updated._count.programs,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
    } catch (e) {
      if (isNotFound(e)) return Response.json({ error: "Degree not found." }, { status: 404 });
      if (isUniqueViolation(e)) {
        return Response.json(
          { error: "A degree with that name or code already exists." },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");
    const { id } = await params;

    // Guard the delete with a clear message before hitting the FK restriction:
    // a Degree with Programs must be deactivated, not deleted.
    const degree = await db.degree.findUnique({
      where: { id },
      include: { _count: { select: { programs: true } } },
    });
    if (!degree) return Response.json({ error: "Degree not found." }, { status: 404 });
    if (degree._count.programs > 0) {
      return Response.json(
        {
          error:
            "This degree has programs built on it. Deactivate it instead of deleting to keep history.",
        },
        { status: 409 },
      );
    }

    await db.degree.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
