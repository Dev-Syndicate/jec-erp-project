// /api/branches — list + create Branches. A Branch (CSE, ECE, MECH…) is a
// discipline in the Structure backbone; it pairs with a Degree to form a Program.
// Structure is INSTITUTION-scoped, so these are Super-Admin only (no program
// filter — the same rule the ability's program conditions encode for scoped roles).
//
// Auth is the CLAUDE.md two-step: authenticate() (who) then authorize() (may) — CASL grants, not role names.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

// Parse + validate a create body. Returns the clean values or an error message —
// the route maps a message to a 400. Kept local so the route is self-contained
// (Degree/Program/Class mirror this shape).
type ParsedBranch = { name: string; code: string };

function parseBranchBody(body: unknown): { data: ParsedBranch } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "Name is required." };

  const code = typeof b.code === "string" ? b.code.trim() : "";
  if (!code) return { error: "Code is required." };

  return { data: { name, code } };
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Branch");

    const branches = await db.branch.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { _count: { select: { programs: true } } },
    });

    return Response.json(
      branches.map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code,
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
    authorize(ctx, "manage", "Branch");

    const body = await req.json().catch(() => null);
    const parsed = parseBranchBody(body);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    try {
      const created = await db.branch.create({ data: parsed.data });
      return Response.json(
        {
          id: created.id,
          name: created.name,
          code: created.code,
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
          { error: "A branch with that name or code already exists." },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}
