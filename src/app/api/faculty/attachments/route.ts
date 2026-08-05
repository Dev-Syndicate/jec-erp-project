// /api/faculty/attachments — lend a lecturer to another department for the
// active semester, so they can be timetabled there.
//
// WHY THIS EXISTS: employment (FacultyProfile.departmentId) answers "who pays
// them", not "where may they teach". S&H teaches first year for every
// department and its staff also visit others, so the two questions genuinely
// diverge. An attachment is the explicit, revocable record of the difference —
// see lib/teaching.ts, which is the single place the rule is applied.
//
// WHO: Super Admin only (`manage all`). Lending staff across departments is an
// institution-level act; a HOD who needs cover asks the admin. Deliberately NOT
// department-scoped — a scoped grant would let one HOD claim another
// department's staff without their agreement.
//
// Attachments are SEMESTER-BOUND: they lapse at rollover and must be renewed, so
// a one-term loan can't quietly become permanent. Note the consequence — a
// TimetableSlot already written under an attachment survives the lapse (this
// check runs at write time). The grid stays intact; that cell just can't be
// edited until the attachment is renewed.
//
// Auth is the CLAUDE.md two-step: authenticate() (who) then authorize() (may).
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isForeignKeyViolation } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

// Attachments only ever concern the semester in progress — a loan into a past or
// future term isn't a thing the college does, and allowing it would let the
// picker offer staff the timetable would then refuse.
function activeSemesterId() {
  return db.semester.findFirst({ where: { isActive: true }, select: { id: true } });
}

const ATTACHMENT_INCLUDE = {
  faculty: {
    select: {
      id: true,
      staffId: true,
      designation: true,
      user: { select: { id: true, displayName: true, status: true } },
      department: { select: { id: true, code: true, name: true } },
    },
  },
  department: { select: { id: true, code: true, name: true } },
  assignedBy: { select: { displayName: true } },
} as const;

type AttachmentRow = {
  id: string;
  reason: string | null;
  createdAt: Date;
  faculty: {
    id: string;
    staffId: string;
    designation: string;
    user: { id: string; displayName: string; status: "ACTIVE" | "INACTIVE" };
    department: { id: string; code: string; name: string };
  };
  department: { id: string; code: string; name: string };
  assignedBy: { displayName: string };
};

function toAttachmentDto(a: AttachmentRow) {
  return {
    id: a.id,
    facultyProfileId: a.faculty.id,
    // The USER id, because that's what the timetable picker posts as facultyId —
    // returning only the profile id would make the client join two lists to use
    // this at all.
    userId: a.faculty.user.id,
    facultyName: a.faculty.user.displayName,
    facultyStatus: a.faculty.user.status,
    staffId: a.faculty.staffId,
    designation: a.faculty.designation,
    homeDepartmentId: a.faculty.department.id,
    homeDepartmentCode: a.faculty.department.code,
    homeDepartmentName: a.faculty.department.name,
    hostDepartmentId: a.department.id,
    hostDepartmentCode: a.department.code,
    hostDepartmentName: a.department.name,
    assignedByName: a.assignedBy.displayName,
    reason: a.reason,
    createdAt: a.createdAt,
  };
}

/**
 * GET [?departmentId=] — attachments for the active semester. Filtered to one
 * host department when asked (the timetable picker's use), otherwise all of them
 * (the admin screen's use).
 */
export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "all");

    const semester = await activeSemesterId();
    // No active semester → no attachments can exist, which is an empty list
    // rather than an error: the admin screen should still render.
    if (!semester) return Response.json([]);

    const departmentId = new URL(req.url).searchParams.get("departmentId")?.trim();

    const attachments = await db.facultyAttachment.findMany({
      relationLoadStrategy: "join",
      where: { semesterId: semester.id, ...(departmentId ? { departmentId } : {}) },
      include: ATTACHMENT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    return Response.json(attachments.map(toAttachmentDto));
  } catch (err) {
    return toAuthResponse(err);
  }
}

/**
 * POST { facultyProfileId, departmentId, reason? } — attach a lecturer to a host
 * department for the active semester. Upserts on the unique triple, so
 * re-attaching updates the reason instead of failing on a duplicate.
 */
export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "all");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return Response.json({ error: "Missing request body." }, { status: 400 });

    const facultyProfileId =
      typeof body.facultyProfileId === "string" ? body.facultyProfileId.trim() : "";
    const departmentId = typeof body.departmentId === "string" ? body.departmentId.trim() : "";
    const reason =
      typeof body.reason === "string" && body.reason.trim() !== "" ? body.reason.trim() : null;

    if (!facultyProfileId) return Response.json({ error: "Select a faculty member." }, { status: 400 });
    if (!departmentId) return Response.json({ error: "Select a department." }, { status: 400 });

    const semester = await activeSemesterId();
    if (!semester) {
      return Response.json(
        { error: "No academic semester is active. Activate one before attaching staff." },
        { status: 400 },
      );
    }

    // Read the lecturer's home department: attaching someone to the department
    // that already employs them is a row that grants nothing, and it would show
    // up in the admin list looking like a real loan.
    const faculty = await db.facultyProfile.findUnique({
      where: { id: facultyProfileId },
      select: { departmentId: true, user: { select: { status: true, displayName: true } } },
    });
    if (!faculty) return Response.json({ error: "Select a valid faculty member." }, { status: 400 });
    if (faculty.user.status !== "ACTIVE") {
      return Response.json({ error: "That account isn't active." }, { status: 400 });
    }
    if (faculty.departmentId === departmentId) {
      return Response.json(
        { error: `${faculty.user.displayName} already belongs to that department.` },
        { status: 400 },
      );
    }

    const department = await db.department.findUnique({
      where: { id: departmentId },
      select: { name: true, isActive: true },
    });
    if (!department) return Response.json({ error: "Select a valid department." }, { status: 400 });
    if (!department.isActive) {
      return Response.json({ error: `${department.name} is not an active department.` }, { status: 400 });
    }

    try {
      const saved = await db.facultyAttachment.upsert({
        where: {
          facultyId_departmentId_semesterId: {
            facultyId: facultyProfileId,
            departmentId,
            semesterId: semester.id,
          },
        },
        create: {
          facultyId: facultyProfileId,
          departmentId,
          semesterId: semester.id,
          assignedById: ctx.user.id,
          reason,
        },
        update: { assignedById: ctx.user.id, reason },
        include: ATTACHMENT_INCLUDE,
      });
      return Response.json(toAttachmentDto(saved), { status: 201 });
    } catch (e) {
      if (isForeignKeyViolation(e)) {
        return Response.json({ error: "Select a valid faculty member and department." }, { status: 400 });
      }
      throw e;
    }
  } catch (err) {
    return toAuthResponse(err);
  }
}
