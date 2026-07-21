// /api/semesters — create a semester (Odd/Even) inside an academic year.
// Super-Admin only. There's no list endpoint: semesters are returned nested in
// GET /api/academic-years. A year can hold at most one Odd + one Even (DB unique
// on (academicYearId, kind)).
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/prisma-errors";
import { SEMESTER_INCLUDE, toSemesterDto } from "../academic-years/dto";

export const dynamic = "force-dynamic";

// Parse + validate a create body. Dates are ISO yyyy-mm-dd; start before end.
export function parseSemesterCreateBody(
  body: unknown,
):
  | { data: { academicYearId: string; kind: "ODD" | "EVEN"; startDate: Date; endDate: Date } }
  | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const academicYearId = typeof b.academicYearId === "string" ? b.academicYearId.trim() : "";
  if (!academicYearId) return { error: "Academic year is required." };

  const kind = b.kind;
  if (kind !== "ODD" && kind !== "EVEN") return { error: "Kind must be ODD or EVEN." };

  const start = typeof b.startDate === "string" ? new Date(b.startDate) : null;
  if (!start || Number.isNaN(start.getTime())) return { error: "Start date is invalid." };

  const end = typeof b.endDate === "string" ? new Date(b.endDate) : null;
  if (!end || Number.isNaN(end.getTime())) return { error: "End date is invalid." };

  if (start >= end) return { error: "Start date must be before the end date." };

  return { data: { academicYearId, kind, startDate: start, endDate: end } };
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Semester");

    const body = await req.json().catch(() => null);
    const parsed = parseSemesterCreateBody(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    try {
      // New semesters start inactive — activation is an explicit step.
      const created = await db.semester.create({
        data: parsed.data,
        include: SEMESTER_INCLUDE,
      });
      return Response.json(toSemesterDto(created), { status: 201 });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return Response.json(
          { error: `This year already has a ${parsed.data.kind === "ODD" ? "Odd" : "Even"} semester.` },
          { status: 409 },
        );
      }
      if (isForeignKeyViolation(e)) {
        return Response.json({ error: "Select a valid academic year." }, { status: 400 });
      }
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}
