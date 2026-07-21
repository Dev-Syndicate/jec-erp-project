// /api/classes/[id] — update + delete a single Class. Super-Admin only (Structure
// is INSTITUTION-scoped). Note: params is a Promise in Next 16 — always await it.
//
// Delete semantics (decided from the schema): the primary "remove" is a
// deactivate (PATCH { isActive: false }), which keeps history. A true DELETE is
// allowed only when the Class has no enrolled students — otherwise we'd orphan
// attendance/marks history, so we return a clean 409 telling the admin to
// deactivate instead.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNotFound, isUniqueViolation } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

// Include shape shared with the list route — build the DTO the same way.
const CLASS_INCLUDE = {
  program: { include: { degree: true, branch: true } },
  _count: { select: { enrollments: true } },
} as const;

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

// Parse a PATCH body: every field optional, but any field present must be valid.
// Returns only the keys that were supplied, so we never overwrite with undefined.
// Program is fixed after create, so only year/section/isActive are editable.
type ClassPatch = { year?: number; section?: string; isActive?: boolean };

function parsePatchBody(body: unknown): { data: ClassPatch } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;
  const data: ClassPatch = {};

  if (b.year !== undefined) {
    const year = b.year;
    if (typeof year !== "number" || !Number.isInteger(year) || year < 1) {
      return { error: "Year must be a whole number of 1 or more." };
    }
    data.year = year;
  }

  if (b.section !== undefined) {
    const section = typeof b.section === "string" ? b.section.trim().toUpperCase() : "";
    if (!/^[A-H]$/.test(section)) return { error: "Section must be a single letter A–H." };
    data.section = section;
  }

  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") return { error: "isActive must be true or false." };
    data.isActive = b.isActive;
  }

  if (Object.keys(data).length === 0) return { error: "Nothing to update." };
  return { data };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Class");
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const parsed = parsePatchBody(body);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    // If the year changed, keep it within the class's program duration. Fetch the
    // existing class (with its degree's duration) to check before writing.
    if (parsed.data.year !== undefined) {
      const existing = await db.class.findUnique({
        where: { id },
        include: { program: { include: { degree: { select: { durationYears: true } } } } },
      });
      if (!existing) return Response.json({ error: "Class not found." }, { status: 404 });
      if (parsed.data.year > existing.program.degree.durationYears) {
        return Response.json(
          { error: "Year is outside this program's duration." },
          { status: 400 },
        );
      }
    }

    try {
      const updated = await db.class.update({
        where: { id },
        data: parsed.data,
        include: CLASS_INCLUDE,
      });
      return Response.json(toDto(updated));
    } catch (e) {
      if (isNotFound(e)) return Response.json({ error: "Class not found." }, { status: 404 });
      if (isUniqueViolation(e)) {
        return Response.json(
          { error: "A class for that program, year and section already exists." },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Class");
    const { id } = await params;

    // Guard the delete with a clear message before hitting the FK restriction:
    // a Class with enrolled students must be deactivated, not deleted.
    const cls = await db.class.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!cls) return Response.json({ error: "Class not found." }, { status: 404 });
    if (cls._count.enrollments > 0) {
      return Response.json(
        {
          error:
            "This class has enrolled students. Deactivate it instead of deleting to keep history.",
        },
        { status: 409 },
      );
    }

    await db.class.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
