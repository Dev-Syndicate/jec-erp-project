// /api/programs — list + create Programs. A Program is a Degree × Branch pairing
// (e.g. B.E × CSE) — it has no name/code of its own; it IS the pairing, and the
// scoping key every class, student and subject belongs to. Creating a program is
// structural (INSTITUTION-scoped) → Super-Admin only. The GET is also read by
// scoped roles (an HOD's program dropdown), so it allows HOD but filters to their
// own program; Super Admin sees all.
//
// Auth is the CLAUDE.md two-step: authenticate() (who) then authorize() (may) — CASL grants, not role names.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation, isForeignKeyViolation } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

// The DTO shape (src/features/structure/types.ts → Program). degree/branch names +
// codes and durationYears are denormalised for display; classCount guards delete.
type ProgramWithRels = {
  id: string;
  degreeId: string;
  branchId: string;
  degree: { name: string; code: string; durationYears: number };
  branch: { name: string; code: string };
  isActive: boolean;
  _count: { classes: number };
  createdAt: Date;
  updatedAt: Date;
};

function toDto(p: ProgramWithRels) {
  return {
    id: p.id,
    degreeId: p.degreeId,
    branchId: p.branchId,
    degreeName: p.degree.name,
    degreeCode: p.degree.code,
    durationYears: p.degree.durationYears,
    branchName: p.branch.name,
    branchCode: p.branch.code,
    isActive: p.isActive,
    classCount: p._count.classes,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// Parse + validate a create body. Only the pairing is set on create.
function parseCreateBody(body: unknown): { data: { degreeId: string; branchId: string } } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const degreeId = typeof b.degreeId === "string" ? b.degreeId.trim() : "";
  if (!degreeId) return { error: "Degree is required." };

  const branchId = typeof b.branchId === "string" ? b.branchId.trim() : "";
  if (!branchId) return { error: "Branch is required." };

  return { data: { degreeId, branchId } };
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "read", "Program");

    // Super Admin: all programs. Scoped roles: only their own program (a Program
    // IS the scoping key, so it filters on the id itself).
    const where = ctx.isInstitutionScoped
      ? {}
      : { id: ctx.user.programId ?? "__none__" };

    const programs = await db.program.findMany({
      where,
      include: { degree: true, branch: true, _count: { select: { classes: true } } },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    });

    return Response.json(programs.map(toDto));
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Program");

    const body = await req.json().catch(() => null);
    const parsed = parseCreateBody(body);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    try {
      const created = await db.program.create({
        data: parsed.data,
        include: { degree: true, branch: true, _count: { select: { classes: true } } },
      });
      return Response.json(toDto(created), { status: 201 });
    } catch (e) {
      // Unique violation on (degreeId, branchId) → clean 409, not a 500.
      if (isUniqueViolation(e)) {
        return Response.json(
          { error: "That degree + branch pairing already exists." },
          { status: 409 },
        );
      }
      // FK violation → a supplied degreeId/branchId doesn't exist.
      if (isForeignKeyViolation(e)) {
        return Response.json({ error: "Select a valid degree and branch." }, { status: 400 });
      }
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}
