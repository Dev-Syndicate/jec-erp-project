// POST /api/semesters/[id]/activate — make this the one active semester. Super-
// Admin only. Enforces the "exactly one active at a time" invariant in a
// transaction, keeping year + semester consistent:
//   - every other semester → inactive
//   - this semester        → active
//   - every other year     → inactive
//   - this semester's year  → active
// So activating a semester also switches the active academic year to its own.
// Returns the parent year (with semesters) so the client reflects both at once.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { toYearDto, YEAR_INCLUDE } from "../../../academic-years/dto";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");
    const { id } = await params;

    const semester = await db.semester.findUnique({
      where: { id },
      select: { id: true, academicYearId: true },
    });
    if (!semester) return Response.json({ error: "Semester not found." }, { status: 404 });
    const yearId = semester.academicYearId;

    await db.$transaction([
      db.semester.updateMany({ where: { isActive: true, NOT: { id } }, data: { isActive: false } }),
      db.semester.update({ where: { id }, data: { isActive: true } }),
      db.academicYear.updateMany({
        where: { isActive: true, NOT: { id: yearId } },
        data: { isActive: false },
      }),
      db.academicYear.update({ where: { id: yearId }, data: { isActive: true } }),
    ]);

    const year = await db.academicYear.findUniqueOrThrow({ where: { id: yearId }, include: YEAR_INCLUDE });
    return Response.json(toYearDto(year));
  } catch (err) {
    return toAuthResponse(err);
  }
}
