// POST /api/academic/years/[id]/terms — add a term (semester) to a year.
// Super Admin only. Terms are what assignments/timetable/attendance scope to.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type CreateBody = { kind?: "ODD" | "EVEN"; startDate?: string; endDate?: string };

// The display label shown for each session.
const TERM_LABEL: Record<"ODD" | "EVEN", string> = {
  ODD: "Odd Semester",
  EVEN: "Even Semester",
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");

    const { id } = await params;
    const year = await db.academicYear.findUnique({ where: { id } });
    if (!year) return Response.json({ error: "Academic year not found." }, { status: 404 });

    const body = (await req.json().catch(() => null)) as CreateBody | null;
    const kind = body?.kind;
    if (kind !== "ODD" && kind !== "EVEN") {
      return Response.json({ error: "Choose Odd or Even semester." }, { status: 400 });
    }
    if (!body?.startDate || !body?.endDate) {
      return Response.json({ error: "Start and end dates are required." }, { status: 400 });
    }
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return Response.json({ error: "Start and end dates must be valid." }, { status: 400 });
    }
    if (endDate <= startDate) {
      return Response.json({ error: "End date must be after the start date." }, { status: 400 });
    }

    // One Odd + one Even per year (unique constraint is the real guard).
    const clash = await db.term.findFirst({ where: { academicYearId: id, kind } });
    if (clash) {
      return Response.json(
        { error: `This year already has an ${TERM_LABEL[kind]}.` },
        { status: 409 },
      );
    }

    const term = await db.term.create({
      data: { name: TERM_LABEL[kind], kind, startDate, endDate, academicYearId: id },
    });

    return Response.json({ term }, { status: 201 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
