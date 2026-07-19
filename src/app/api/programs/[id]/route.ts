// /api/programs/[id] — update + delete a single Program. Super-Admin only
// (Structure is INSTITUTION-scoped). Note: params is a Promise in Next 16 — await it.
//
// A Program has no editable fields but isActive (it IS the pairing), so PATCH only
// toggles active state. Delete semantics: the primary "remove" is a deactivate
// (PATCH { isActive: false }), which keeps history. A true DELETE is allowed only
// when the Program has no dependents (classes AND users AND subjects all zero) —
// otherwise we return a clean 409 telling the admin to deactivate instead.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNotFound } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

type ProgramWithRels = {
  id: string;
  degreeId: string;
  branchId: string;
  degree: { name: string; code: string; durationYears: number };
  branch: { name: string; code: string };
  isActive: boolean;
  _count: { classes: number };
  createdAt: Date;
  updatedAt: Date;
};

function toDto(p: ProgramWithRels) {
  return {
    id: p.id,
    degreeId: p.degreeId,
    branchId: p.branchId,
    degreeName: p.degree.name,
    degreeCode: p.degree.code,
    durationYears: p.degree.durationYears,
    branchName: p.branch.name,
    branchCode: p.branch.code,
    isActive: p.isActive,
    classCount: p._count.classes,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// PATCH body: the only editable field is isActive.
function parsePatchBody(body: unknown): { data: { isActive: boolean } } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  if (b.isActive === undefined) return { error: "Nothing to update." };
  if (typeof b.isActive !== "boolean") return { error: "isActive must be true or false." };

  return { data: { isActive: b.isActive } };
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
      const updated = await db.program.update({
        where: { id },
        data: parsed.data,
        include: { degree: true, branch: true, _count: { select: { classes: true } } },
      });
      return Response.json(toDto(updated));
    } catch (e) {
      if (isNotFound(e)) return Response.json({ error: "Program not found." }, { status: 404 });
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

    // Guard the delete with a clear message before hitting any FK restriction: a
    // Program with classes, users, or subjects must be deactivated, not deleted.
    const program = await db.program.findUnique({
      where: { id },
      include: { _count: { select: { classes: true, users: true, subjects: true } } },
    });
    if (!program) return Response.json({ error: "Program not found." }, { status: 404 });
    if (
      program._count.classes > 0 ||
      program._count.users > 0 ||
      program._count.subjects > 0
    ) {
      return Response.json(
        {
          error:
            "This program has classes, users, or subjects. Deactivate it instead of deleting to keep history.",
        },
        { status: 409 },
      );
    }

    await db.program.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
