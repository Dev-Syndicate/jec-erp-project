// GET/POST /api/teacher-assignments — for the ACTIVE term, who teaches which
// subject to which section. This is the row the attendance guard will check
// (a teacher may mark only sections they're assigned to). Term-scoped: changes
// every semester; old terms keep their rows as history.
//
// Authorization: Super Admin (any dept) or HOD (own dept only).
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function resolveDeptId(
  ctx: { roles: string[]; user: { departmentId: string | null } },
  passed: string | null,
): string | null {
  return ctx.roles.includes("Super Admin") ? passed : ctx.user.departmentId;
}

async function activeTerm() {
  return db.term.findFirst({ where: { isActive: true }, include: { academicYear: true } });
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const departmentId = resolveDeptId(ctx, new URL(req.url).searchParams.get("departmentId"));
    if (!departmentId) return Response.json({ error: "A department is required." }, { status: 400 });
    assertDeptScope(ctx, departmentId);

    const term = await activeTerm();
    if (!term) {
      return Response.json({ assignments: [], term: null });
    }

    const rows = await db.teacherAssignment.findMany({
      where: { departmentId, termId: term.id },
      orderBy: { createdAt: "desc" },
      include: {
        teacher: { select: { id: true, displayName: true } },
        subject: { select: { id: true, name: true, code: true, semesterNumber: true } },
        section: { select: { id: true, name: true, class: { select: { name: true } } } },
      },
    });

    return Response.json({
      term: { id: term.id, name: term.name, yearName: term.academicYear.name },
      assignments: rows.map((r) => ({
        id: r.id,
        teacherId: r.teacher.id,
        teacherName: r.teacher.displayName,
        subjectId: r.subject.id,
        subjectName: r.subject.name,
        subjectCode: r.subject.code,
        semesterNumber: r.subject.semesterNumber,
        sectionId: r.section.id,
        sectionName: r.section.name,
        className: r.section.class.name,
      })),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}

type CreateBody = { teacherId?: string; subjectId?: string; sectionId?: string };

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const term = await activeTerm();
    if (!term) {
      return Response.json({ error: "Activate a term first (Academic year & terms)." }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as CreateBody | null;
    if (!body?.teacherId || !body?.subjectId || !body?.sectionId) {
      return Response.json({ error: "teacher, subject and section are all required." }, { status: 400 });
    }

    // The section pins the department (section -> class -> department).
    const section = await db.section.findUnique({
      where: { id: body.sectionId },
      include: { class: true },
    });
    if (!section) return Response.json({ error: "Unknown section." }, { status: 400 });
    const departmentId = section.class.departmentId;
    assertDeptScope(ctx, departmentId);

    // Subject must belong to the same department.
    const subject = await db.subject.findUnique({ where: { id: body.subjectId } });
    if (!subject || subject.departmentId !== departmentId) {
      return Response.json({ error: "Subject doesn’t belong to this section’s department." }, { status: 400 });
    }

    // Teacher must be a real staff user (not a student).
    const teacher = await db.user.findUnique({
      where: { id: body.teacherId },
      include: { student: { select: { id: true } } },
    });
    if (!teacher || teacher.student) {
      return Response.json({ error: "Unknown teacher." }, { status: 400 });
    }

    const clash = await db.teacherAssignment.findFirst({
      where: {
        teacherId: body.teacherId,
        sectionId: body.sectionId,
        subjectId: body.subjectId,
        termId: term.id,
      },
    });
    if (clash) {
      return Response.json({ error: "That teacher already teaches this subject to this section." }, { status: 409 });
    }

    const created = await db.teacherAssignment.create({
      data: {
        teacherId: body.teacherId,
        subjectId: body.subjectId,
        sectionId: body.sectionId,
        departmentId,
        termId: term.id,
      },
    });

    return Response.json({ id: created.id }, { status: 201 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
