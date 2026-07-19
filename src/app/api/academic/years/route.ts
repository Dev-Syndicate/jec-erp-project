// GET/POST /api/academic/years — list academic years (with their terms) and
// create a new one.
//
// Academic years + terms are the time-scoping backbone: assignments (and later
// timetable/attendance) filter on the ACTIVE term. Exactly one year and one term
// are active at a time (enforced on activate, see .../activate).
//
// Authorization: Super Admin only — years/terms are institution-wide structure.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD"); // HOD may read (needs the active term)

    const years = await db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      include: {
        terms: { orderBy: { startDate: "asc" } },
      },
    });

    return Response.json({ years });
  } catch (err) {
    return toAuthResponse(err);
  }
}

type CreateBody = { name?: string; startDate?: string; endDate?: string };

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");

    const body = (await req.json().catch(() => null)) as CreateBody | null;
    const name = body?.name?.trim();
    if (!name || !body?.startDate || !body?.endDate) {
      return Response.json({ error: "Name, start date and end date are required." }, { status: 400 });
    }
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return Response.json({ error: "Start and end dates must be valid." }, { status: 400 });
    }
    if (endDate <= startDate) {
      return Response.json({ error: "End date must be after the start date." }, { status: 400 });
    }

    const clash = await db.academicYear.findUnique({ where: { name } });
    if (clash) {
      return Response.json({ error: `An academic year "${name}" already exists.` }, { status: 409 });
    }

    const year = await db.academicYear.create({
      data: { name, startDate, endDate },
      include: { terms: true },
    });

    return Response.json({ year }, { status: 201 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
