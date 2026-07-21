// /api/academic-years — list + create academic years. An AcademicYear holds its
// (up to two) semesters; the Semester is the hub every time-bound record points
// at. Institution-level setup, so Super-Admin only.
//
// Auth is the CLAUDE.md two-step: authenticate() (who) then authorize() (may) — CASL grants, not role names.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { toYearDto, YEAR_INCLUDE } from "./dto";

export const dynamic = "force-dynamic";

// Parse + validate a create/update body. Dates are ISO yyyy-mm-dd; start must be
// before end. Returns clean values or an error message (→ 400).
export function parseYearBody(
  body: unknown,
): { data: { name: string; startDate: Date; endDate: Date } } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "Name is required (e.g. 2025-2026)." };

  const start = typeof b.startDate === "string" ? new Date(b.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) return { error: "Start date is invalid." };

  const end = typeof b.endDate === "string" ? new Date(b.endDate) : null;
  if (!end || Number.isNaN(end.getTime())) return { error: "End date is invalid." };

  if (start >= end) return { error: "Start date must be before the end date." };

  return { data: { name, startDate: start, endDate: end } };
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "AcademicYear");

    const years = await db.academicYear.findMany({
      include: YEAR_INCLUDE,
      orderBy: { startDate: "desc" },
    });

    return Response.json(years.map(toYearDto));
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "AcademicYear");

    const body = await req.json().catch(() => null);
    const parsed = parseYearBody(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    try {
      // New years start inactive — activation is an explicit, side-effectful step.
      const created = await db.academicYear.create({
        data: parsed.data,
        include: YEAR_INCLUDE,
      });
      return Response.json(toYearDto(created), { status: 201 });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return Response.json({ error: "An academic year with that name already exists." }, { status: 409 });
      }
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}
