// POST /api/academic-years/[id]/activate — make this the one active academic
// year. Super-Admin only. This is the "exactly one active at a time" invariant,
// enforced in app (not the DB), so it runs in a transaction:
//   - every other year → inactive
//   - this year        → active
//   - any active semester belonging to a DIFFERENT year → inactive
// (the active semester must sit inside the active year; switching years clears a
// stale one. The user then activates this year's Odd/Even.)
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { toYearDto, YEAR_INCLUDE } from "../../dto";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");
    const { id } = await params;

    const exists = await db.academicYear.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return Response.json({ error: "Academic year not found." }, { status: 404 });

    await db.$transaction([
      db.academicYear.updateMany({
        where: { isActive: true, NOT: { id } },
        data: { isActive: false },
      }),
      db.academicYear.update({ where: { id }, data: { isActive: true } }),
      db.semester.updateMany({
        where: { isActive: true, academicYearId: { not: id } },
        data: { isActive: false },
      }),
    ]);

    const year = await db.academicYear.findUniqueOrThrow({ where: { id }, include: YEAR_INCLUDE });
    return Response.json(toYearDto(year));
  } catch (err) {
    return toAuthResponse(err);
  }
}
