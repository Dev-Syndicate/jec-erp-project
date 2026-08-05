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
function parseClassBody(body: unknown):
  | {
      data: {
        programId: string;
        departmentId: string | null;
        year: number;
        section: string;
        advisorId: string | null;
      };
    }
  | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const programId = typeof b.programId === "string" ? b.programId.trim() : "";
  if (!programId) return { error: "Select a program." };

  // The OWNING department. Optional: omitted means "the department that runs the
  // program", which is every year-2+ class. Supplied means an explicit owner —
  // how a first-year class is given to S&H while its award stays B.E-CSE.
  const departmentId =
    typeof b.departmentId === "string" && b.departmentId.trim() !== ""
      ? b.departmentId.trim()
      : null;

  const year = b.year;
  if (typeof year !== "number" || !Number.isInteger(year) || year < 1) {
    return { error: "Year must be a whole number of 1 or more." };
  }

  // Free text, but STORED UPPERCASE — "a" and "A" must never become two different
  // sections, since (programId, year, section) is unique and the pair would both
  // be accepted. Uppercasing here (not only in the form) is what makes that true
  // for every caller, the importer and scripts included.
  const rawSection = typeof b.section === "string" ? b.section.trim().toUpperCase() : "";
  if (!rawSection) return { error: "Section is required." };
  if (rawSection.length > 4) return { error: "Section can be at most 4 characters." };

  // advisorId (class teacher) is optional — validated against the program in POST.
  const advisorId =
    typeof b.advisorId === "string" && b.advisorId.trim() !== "" ? b.advisorId.trim() : null;

  return { data: { programId, departmentId, year, section: rawSection, advisorId } };
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    // Read-only list: HOD/Faculty need it for class dropdowns (attendance, etc.),
    // so it's `read` (they hold read Class), not the `manage` the create needs.
    authorize(ctx, "read", "Class");

    // Super Admin: all classes. Scoped roles: the classes their own DEPARTMENT
    // owns. Department, not program: staff carry no award (User.programId is null
    // for every staff account since the department model landed), so filtering on
    // it here returned an empty list for every HOD.
    const where = ctx.isInstitutionScoped
      ? {}
      : { departmentId: ctx.departmentId ?? "__none__" };

    const classes = await db.class.findMany({
      relationLoadStrategy: "join",
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
      select: { departmentId: true, degree: { select: { durationYears: true } } },
    });
    if (program && parsed.data.year > program.degree.durationYears) {
      return Response.json(
        { error: "Year is outside this program's duration." },
        { status: 400 },
      );
    }

    // WHO OWNS THIS CLASS. Explicit when given — that is how a first-year class is
    // handed to S&H while its award stays B.E-CSE. Defaults to the department that
    // runs the program, which is the year-2-onwards case and preserves today's
    // behaviour for every existing caller.
    const departmentId = parsed.data.departmentId ?? program?.departmentId;
    if (!departmentId) {
      return Response.json({ error: "Select a valid program." }, { status: 400 });
    }

    // Scoped on the OWNER, and checked only now because the owner isn't known until
    // it's resolved above. A HOD may create classes for their own department only;
    // without this, `manage Class` would let them plant a class in any department —
    // including handing one to S&H — since the capability check alone is unscoped.
    authorize(ctx, "manage", "Class", { departmentId });

    // The class teacher (if chosen) must be active staff in this program.
    // Against the OWNING department, not the award — the class teacher is staff of
    // whichever unit runs the class (S&H for first year).
    const advisor = await validateAdvisor(parsed.data.advisorId, departmentId);
    if ("error" in advisor) return Response.json({ error: advisor.error }, { status: 400 });

    try {
      const created = await db.class.create({
        data: {
          programId: parsed.data.programId,
          departmentId,
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
