// /api/classes — list + create Classes. A Class is a group WITHIN a Program: a
// year + section (e.g. II-A), optionally an advisor. Structure is INSTITUTION-
// scoped, so these are Super-Admin only (no program filter — the same rule
// assertProgramScope encodes for scoped roles).
//
// Auth is the CLAUDE.md two-step: authenticate() (who) then requireRole() (may).
// The role check is the current stopgap until the CASL factory (src/lib/rbac) lands.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation, isForeignKeyViolation } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

// Include shape shared by list + create so the DTO is built the same way both
// places (program → degree/branch codes for the label; enrollment count for the
// student total + delete guard).
const CLASS_INCLUDE = {
  program: { include: { degree: true, branch: true } },
  _count: { select: { enrollments: true } },
} as const;

// A row from findMany/create with CLASS_INCLUDE, mapped to the Class DTO.
type ClassRow = {
  id: string;
  programId: string;
  program: { degree: { code: string }; branch: { code: string } };
  year: number;
  section: string;
  advisorId: string | null;
  isActive: boolean;
  _count: { enrollments: number };
  createdAt: Date;
  updatedAt: Date;
};

function toDto(c: ClassRow) {
  return {
    id: c.id,
    programId: c.programId,
    programLabel: `${c.program.degree.code} · ${c.program.branch.code}`,
    year: c.year,
    section: c.section,
    advisorId: c.advisorId,
    isActive: c.isActive,
    studentCount: c._count.enrollments,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

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

  // advisorId is deferred (no staff-listing endpoint yet) — accept null/absent.
  const advisorId =
    typeof b.advisorId === "string" && b.advisorId.trim() !== "" ? b.advisorId.trim() : null;

  return { data: { programId, year, section: rawSection, advisorId } };
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");

    const classes = await db.class.findMany({
      include: CLASS_INCLUDE,
      orderBy: [{ isActive: "desc" }, { year: "asc" }, { section: "asc" }],
    });

    return Response.json(classes.map(toDto));
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");

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

    try {
      const created = await db.class.create({
        data: {
          programId: parsed.data.programId,
          year: parsed.data.year,
          section: parsed.data.section,
          advisorId: parsed.data.advisorId,
        },
        include: CLASS_INCLUDE,
      });
      return Response.json(toDto(created), { status: 201 });
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
