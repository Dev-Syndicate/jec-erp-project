// /api/classes — list + create Classes. A Class is a group WITHIN a Program: a
// year + section (e.g. II-A), optionally an advisor. Creating a class is
// structural (INSTITUTION-scoped) → Super-Admin only. The GET is also read by
// scoped roles (an HOD's class dropdown for enrollment / timetable), so it allows
// HOD but filters to their own program; Super Admin sees all.
//
// Auth is the CLAUDE.md two-step: authenticate() (who) then authorize() (may) — CASL grants, not role names.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation, isForeignKeyViolation } from "@/lib/prisma-errors";
import { CLASS_INCLUDE, toClassDto, validateAdvisor } from "./dto";

export const dynamic = "force-dynamic";

// Parse + validate a create body. Year is bounded by the selected program's
// degree duration, so the route fetches the program first (in POST) to check it.
function parseClassBody(
  body: unknown,
): { data: { programId: string; year: number; section: string; advisorId: string | null } } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const programId = typeof b.programId === "string" ? b.programId.trim() : "";
  if (!programId) return { error: "Select a program." };

  const year = b.year;
  if (typeof year !== "number" || !Number.isInteger(year) || year < 1) {
    return { error: "Year must be a whole number of 1 or more." };
  }

  const rawSection = typeof b.section === "string" ? b.section.trim().toUpperCase() : "";
  if (!/^[A-H]$/.test(rawSection)) return { error: "Section must be a single letter A–H." };

  // advisorId (class teacher) is optional — validated against the program in POST.
  const advisorId =
    typeof b.advisorId === "string" && b.advisorId.trim() !== "" ? b.advisorId.trim() : null;

  return { data: { programId, year, section: rawSection, advisorId } };
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    // Read-only list: HOD/Faculty need it for class dropdowns (attendance, etc.),
    // so it's `read` (they hold read Class), not the `manage` the create needs.
    authorize(ctx, "read", "Class");

    // Super Admin: all classes. Scoped roles: only classes in their own program.
    const where = ctx.isInstitutionScoped
      ? {}
      : { programId: ctx.user.programId ?? "__none__" };

    const classes = await db.class.findMany({
      where,
      include: CLASS_INCLUDE,
      orderBy: [{ isActive: "desc" }, { year: "asc" }, { section: "asc" }],
    });

    return Response.json(classes.map(toClassDto));
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Class");

    const body = await req.json().catch(() => null);
    const parsed = parseClassBody(body);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    // Bound the year by the program's degree duration. If the program doesn't
    // exist the create below hits P2003 → a clean "select a valid program".
    const program = await db.program.findUnique({
      where: { id: parsed.data.programId },
      include: { degree: { select: { durationYears: true } } },
    });
    if (program && parsed.data.year > program.degree.durationYears) {
      return Response.json(
        { error: "Year is outside this program's duration." },
        { status: 400 },
      );
    }

    // The class teacher (if chosen) must be active staff in this program.
    const advisor = await validateAdvisor(parsed.data.advisorId, parsed.data.programId);
    if ("error" in advisor) return Response.json({ error: advisor.error }, { status: 400 });

    try {
      const created = await db.class.create({
        data: {
          programId: parsed.data.programId,
          year: parsed.data.year,
          section: parsed.data.section,
          advisorId: advisor.ok,
        },
        include: CLASS_INCLUDE,
      });
      return Response.json(toClassDto(created), { status: 201 });
    } catch (e) {
      // Duplicate (program, year, section) → clean 409, not a 500.
      if (isUniqueViolation(e)) {
        return Response.json(
          { error: "A class for that program, year and section already exists." },
          { status: 409 },
        );
      }
      // Bad programId (FK) → 400.
      if (isForeignKeyViolation(e)) {
        return Response.json({ error: "Select a valid program." }, { status: 400 });
      }
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}
