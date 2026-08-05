// /api/departments/[id] — update + delete a single Department. Super-Admin only
// (Structure is INSTITUTION-scoped). Note: params is a Promise in Next 16 — always
// await it.
//
// Delete semantics mirror branches: the primary "remove" is a deactivate
// (PATCH { isActive: false }), which keeps history. A true DELETE is allowed only
// when the department owns NOTHING — no programs, no classes and no staff.
// A department is the scoping key for all three, so deleting a populated one would
// orphan every record that hangs off it; the FK would restrict it anyway, and a
// clean 409 explains what to do instead.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNotFound, isUniqueViolation } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

// Parse a PATCH body: every field optional, but any field present must be valid.
// Returns only the keys that were supplied, so we never overwrite with undefined.
type DepartmentPatch = { name?: string; code?: string; isActive?: boolean };

function parsePatchBody(body: unknown): { data: DepartmentPatch } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;
  const data: DepartmentPatch = {};

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

  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") return { error: "isActive must be true or false." };
    data.isActive = b.isActive;
  }

  if (Object.keys(data).length === 0) return { error: "Nothing to update." };
  return { data };
}

const DEPARTMENT_COUNT = {
  _count: { select: { programs: true, classes: true, facultyProfiles: true } },
} as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Branch");
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const parsed = parsePatchBody(body);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    try {
      const updated = await db.department.update({
        where: { id },
        data: parsed.data,
        include: DEPARTMENT_COUNT,
      });
      return Response.json({
        id: updated.id,
        name: updated.name,
        code: updated.code,
        isActive: updated.isActive,
        programCount: updated._count.programs,
        classCount: updated._count.classes,
        facultyCount: updated._count.facultyProfiles,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
    } catch (e) {
      if (isNotFound(e)) return Response.json({ error: "Department not found." }, { status: 404 });
      if (isUniqueViolation(e)) {
        return Response.json(
          { error: "A department with that name or code already exists." },
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
    authorize(ctx, "manage", "Branch");
    const { id } = await params;

    const department = await db.department.findUnique({
      where: { id },
      include: DEPARTMENT_COUNT,
    });
    if (!department) return Response.json({ error: "Department not found." }, { status: 404 });

    // All three are checked, not just programs: a teaching-only department (S&H)
    // has zero programs by definition, so guarding on programs alone would leave a
    // fully staffed department holding every first-year class deletable.
    const { programs, classes, facultyProfiles } = department._count;
    if (programs > 0 || classes > 0 || facultyProfiles > 0) {
      const holds = [
        programs > 0 ? `${programs} program${programs === 1 ? "" : "s"}` : null,
        classes > 0 ? `${classes} class${classes === 1 ? "" : "es"}` : null,
        facultyProfiles > 0 ? `${facultyProfiles} staff` : null,
      ].filter(Boolean);
      return Response.json(
        {
          error: `This department still has ${holds.join(", ")}. Deactivate it instead of deleting to keep history.`,
        },
        { status: 409 },
      );
    }

    await db.department.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
