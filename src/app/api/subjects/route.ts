// /api/subjects — list + create subjects. A Subject is a per-program curriculum
// entry keyed by semesterNumber (1..2×durationYears). Open to Super Admin (all
// programs) and HOD (their own program only), program-scoped via the `where` + a scoped
// authorize below.
//
// Auth is the CLAUDE.md two-step: authenticate() (who) then authorize() (may) — CASL grants, not role names.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/prisma-errors";
import { SUBJECT_INCLUDE, toSubjectDto } from "./dto";

export const dynamic = "force-dynamic";

type ParsedSubject = { programId: string; name: string; code: string; semesterNumber: number };

function parseSubjectBody(body: unknown): { data: ParsedSubject } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const programId = typeof b.programId === "string" ? b.programId.trim() : "";
  if (!programId) return { error: "Program is required." };

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "Name is required." };

  const code = typeof b.code === "string" ? b.code.trim() : "";
  if (!code) return { error: "Code is required." };

  const semesterNumber = b.semesterNumber;
  if (typeof semesterNumber !== "number" || !Number.isInteger(semesterNumber) || semesterNumber < 1) {
    return { error: "Semester must be a whole number of 1 or more." };
  }

  return { data: { programId, name, code, semesterNumber } };
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Subject");

    // Super Admin: all subjects. Scoped roles: two sources, because a department
    // TEACHES more awards than it RUNS.
    //
    //   1. The awards their own department runs (the ordinary case). A department
    //      may run several — Civil running B.E-CIVIL and B.E-STRUCT.
    //   2. The awards of every class their department OWNS. This is what makes
    //      Science & Humanities work: S&H runs no award at all, but owns every
    //      first-year class, so its subjects are other departments' B.E-CSE /
    //      B.E-ECE ones. Without this arm an S&H HOD sees ZERO subjects and can't
    //      build the first-year timetable POST /api/timetable would happily accept.
    //
    // (Was `ctx.user.programId`, which is null for every staff account since the
    // department model landed — an empty list for every HOD.)
    const where = ctx.isInstitutionScoped
      ? {}
      : {
          OR: [
            { programId: { in: ctx.ownProgramIds } },
            { program: { classes: { some: { departmentId: ctx.departmentId ?? "__none__" } } } },
          ],
        };

    const subjects = await db.subject.findMany({
      relationLoadStrategy: "join",
      where,
      include: SUBJECT_INCLUDE,
      orderBy: [{ isActive: "desc" }, { semesterNumber: "asc" }, { code: "asc" }],
    });

    return Response.json(subjects.map(toSubjectDto));
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Subject");

    const body = await req.json().catch(() => null);
    const parsed = parseSubjectBody(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    authorize(ctx, "manage", "Subject", { programId: parsed.data.programId });

    // semesterNumber is bounded by the program's degree duration (1..2×years).
    const program = await db.program.findUnique({
      where: { id: parsed.data.programId },
      include: { degree: { select: { durationYears: true } } },
    });
    if (!program) return Response.json({ error: "Select a valid program." }, { status: 400 });
    const maxSemester = program.degree.durationYears * 2;
    if (parsed.data.semesterNumber > maxSemester) {
      return Response.json(
        { error: `Semester must be between 1 and ${maxSemester} for this program.` },
        { status: 400 },
      );
    }

    try {
      const created = await db.subject.create({ data: parsed.data, include: SUBJECT_INCLUDE });
      return Response.json(toSubjectDto(created), { status: 201 });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return Response.json(
          { error: "A subject with that code already exists in this program." },
          { status: 409 },
        );
      }
      if (isForeignKeyViolation(e)) {
        return Response.json({ error: "Select a valid program." }, { status: 400 });
      }
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}
