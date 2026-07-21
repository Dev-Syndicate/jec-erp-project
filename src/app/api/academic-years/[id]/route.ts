// /api/academic-years/[id] — update + delete one academic year. Super-Admin only.
// params is a Promise in Next 16 — await it.
//
// Delete is guarded: the active year can't be deleted (switch first), nor one
// that still has semesters or student enrollments — a clean 409 explains which.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNotFound, isUniqueViolation } from "@/lib/prisma-errors";
import { toYearDto, YEAR_INCLUDE } from "../dto";
import { parseYearBody } from "../route";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "AcademicYear");
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const parsed = parseYearBody(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    try {
      const updated = await db.academicYear.update({
        where: { id },
        data: parsed.data,
        include: YEAR_INCLUDE,
      });
      return Response.json(toYearDto(updated));
    } catch (e) {
      if (isNotFound(e)) return Response.json({ error: "Academic year not found." }, { status: 404 });
      if (isUniqueViolation(e)) {
        return Response.json({ error: "An academic year with that name already exists." }, { status: 409 });
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
    authorize(ctx, "manage", "AcademicYear");
    const { id } = await params;

    const year = await db.academicYear.findUnique({
      where: { id },
      include: { _count: { select: { semesters: true, enrollments: true } } },
    });
    if (!year) return Response.json({ error: "Academic year not found." }, { status: 404 });
    if (year.isActive) {
      return Response.json(
        { error: "This is the active academic year. Activate another year before deleting it." },
        { status: 409 },
      );
    }
    if (year._count.semesters > 0) {
      return Response.json(
        { error: "This year still has semesters. Delete them first." },
        { status: 409 },
      );
    }
    if (year._count.enrollments > 0) {
      return Response.json(
        { error: "This year has student enrollments and can't be deleted." },
        { status: 409 },
      );
    }

    await db.academicYear.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
