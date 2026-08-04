// /api/departments — list + create Departments. A Department is the ORGANISATIONAL
// unit in the Structure backbone: it employs staff, has a HOD, owns classes and runs
// one or more Programs (which may span several branches — Civil running B.E·CIVIL
// and B.E·STRUCT). A Branch, by contrast, is only the discipline label in an award.
// Structure is INSTITUTION-scoped, so these are Super-Admin only (no program filter
// — the same rule the ability's program conditions encode for scoped roles).
//
// Auth is the CLAUDE.md two-step: authenticate() (who) then authorize() (may) — CASL grants, not role names.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

// Parse + validate a create body. Returns the clean values or an error message —
// the route maps a message to a 400. Kept local so the route is self-contained
// (Degree/Branch/Program/Class mirror this shape).
type ParsedDepartment = { name: string; code: string };

function parseDepartmentBody(body: unknown): { data: ParsedDepartment } | { error: string } {
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
    // A READ, gated on `read Branch` rather than `manage Branch`. Creating a
    // department is Super-Admin-only (see POST), but the list is a PICKER: the
    // faculty form needs it to name an employer, and that form is open to HODs.
    // Requiring the write capability here would 403 every HOD on a dropdown.
    authorize(ctx, "read", "Branch");

    // Scoped like the rest of the employment axis: an institution role sees every
    // department, anyone else sees only their own — so a HOD's picker offers the
    // one department they may actually assign staff to, and the list can't be used
    // to enumerate the college.
    const where = ctx.isInstitutionScoped ? {} : { id: ctx.departmentId ?? "__none__" };

    const departments = await db.department.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { programs: true, classes: true, facultyProfiles: true } },
      },
    });

    return Response.json(
      departments.map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code,
        isActive: d.isActive,
        // The three things a department owns. They drive the display and the
        // delete guard — a department that runs programs, owns classes or employs
        // staff can't be hard-deleted, only deactivated.
        programCount: d._count.programs,
        classCount: d._count.classes,
        facultyCount: d._count.facultyProfiles,
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
    const parsed = parseDepartmentBody(body);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    try {
      const created = await db.department.create({ data: parsed.data });
      return Response.json(
        {
          id: created.id,
          name: created.name,
          code: created.code,
          isActive: created.isActive,
          programCount: 0,
          classCount: 0,
          facultyCount: 0,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
        { status: 201 },
      );
    } catch (e) {
      // Unique violation on name or code (P2002) → a clean 409, not a 500.
      if (isUniqueViolation(e)) {
        return Response.json(
          { error: "A department with that name or code already exists." },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}
