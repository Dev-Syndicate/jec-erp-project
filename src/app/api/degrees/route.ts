// /api/degrees — list + create Degrees. A Degree (B.E, B.Tech, MBA…) is the top
// of the Structure backbone; its durationYears bounds every Program's year and
// semester ranges. Structure is INSTITUTION-scoped, so these are Super-Admin only
// (no program filter — the same rule assertProgramScope encodes for scoped roles).
//
// Auth is the CLAUDE.md two-step: authenticate() (who) then requireRole() (may).
// The role check is the current stopgap until the CASL factory (src/lib/rbac) lands.
import { authenticate, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

const MAX_DURATION_YEARS = 10;

// Parse + validate a create body. Returns the clean values or an error message —
// the route maps a message to a 400. Kept local so the route is self-contained
// (Branch/Program/Class mirror this shape).
type ParsedDegree = { name: string; code: string; durationYears: number };

function parseDegreeBody(body: unknown): { data: ParsedDegree } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "Name is required." };

  const code = typeof b.code === "string" ? b.code.trim() : "";
  if (!code) return { error: "Code is required." };

  const durationYears = b.durationYears;
  if (
    typeof durationYears !== "number" ||
    !Number.isInteger(durationYears) ||
    durationYears < 1 ||
    durationYears > MAX_DURATION_YEARS
  ) {
    return { error: `Duration must be a whole number of years (1–${MAX_DURATION_YEARS}).` };
  }

  return { data: { name, code, durationYears } };
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");

    const degrees = await db.degree.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { _count: { select: { programs: true } } },
    });

    return Response.json(
      degrees.map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code,
        durationYears: d.durationYears,
        isActive: d.isActive,
        programCount: d._count.programs,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    );
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");

    const body = await req.json().catch(() => null);
    const parsed = parseDegreeBody(body);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    try {
      const created = await db.degree.create({ data: parsed.data });
      return Response.json(
        {
          id: created.id,
          name: created.name,
          code: created.code,
          durationYears: created.durationYears,
          isActive: created.isActive,
          programCount: 0,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
        { status: 201 },
      );
    } catch (e) {
      // Unique violation on name or code (P2002) → a clean 409, not a 500.
      if (isUniqueViolation(e)) {
        return Response.json(
          { error: "A degree with that name or code already exists." },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}
