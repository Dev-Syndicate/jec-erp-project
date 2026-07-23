// /api/leave — the student's OD/leave requests, and the approver's queue.
//
// GET  → role-scoped list:
//   • a student sees their OWN requests (resolved from ctx.user; never a client id).
//   • an approver (Faculty who advises / HOD / SA) sees the requests they can act
//     on — their advised classes (Faculty) or the whole program (HOD/SA).
// POST { type, fromDate, toDate, reason } → a student raises a request for their
//   own active-year class. Starts at PENDING_TEACHER. No attendance is touched
//   until the final HOD approval (see [id]/action).
import { authenticate, authorize, can, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { canActOnStage } from "./access";
import { LEAVE_INCLUDE, parseDateOnly, toLeaveDto } from "./dto";

export const dynamic = "force-dynamic";

const isType = (v: unknown): v is "OD" | "LEAVE" => v === "OD" || v === "LEAVE";

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "read", "Leave");

    // A student → their own requests. Resolve the student from the token, never a
    // client-supplied id (the self-scope guarantee).
    const student = await db.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true } });

    let where;
    if (student) {
      where = { studentId: student.id };
    } else if (ctx.ability.can("manage", "Attendance")) {
      // HOD/SA: the whole program (SA unscoped).
      where = ctx.isInstitutionScoped ? {} : { class: { programId: ctx.user.programId ?? "__none__" } };
    } else {
      // A plain approver (Faculty): only requests for classes they advise.
      where = { class: { advisorId: ctx.user.id } };
    }

    const requests = await db.leaveRequest.findMany({
      where,
      include: LEAVE_INCLUDE,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return Response.json({
      // The UI shows approver controls only to a non-student who can approve.
      canApprove: !student && can(ctx, "approve", "Leave"),
      isStudent: !!student,
      // Per-request: may THIS viewer act at the request's CURRENT stage? An HOD
      // gets `actionable: false` on a PENDING_TEACHER row, so no Approve/Reject
      // button appears until the class teacher has moved it to PENDING_HOD.
      requests: requests.map((r) => toLeaveDto(r, !student && canActOnStage(ctx, r))),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "apply", "Leave");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const type = body?.type;
    const fromStr = typeof body?.fromDate === "string" ? body.fromDate.trim() : "";
    const toStr = typeof body?.toDate === "string" ? body.toDate.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (!isType(type)) return Response.json({ error: "Choose OD or Leave." }, { status: 400 });
    const from = parseDateOnly(fromStr);
    const to = parseDateOnly(toStr);
    if (!from || !to) return Response.json({ error: "Pick valid from/to dates." }, { status: 400 });
    if (to.getTime() < from.getTime()) return Response.json({ error: "The end date can't be before the start." }, { status: 400 });
    if (!reason) return Response.json({ error: "A reason is required." }, { status: 400 });
    if (reason.length > 500) return Response.json({ error: "Keep the reason under 500 characters." }, { status: 400 });

    // Resolve the applicant's student record + active-year class + active semester.
    const student = await db.student.findUnique({
      where: { userId: ctx.user.id },
      include: {
        enrollments: {
          where: { academicYear: { isActive: true } },
          include: { class: { select: { id: true } } },
          take: 1,
        },
      },
    });
    if (!student) return Response.json({ error: "This isn't a student account." }, { status: 403 });

    const enrollment = student.enrollments[0];
    if (!enrollment) return Response.json({ error: "You're not placed in a class this year." }, { status: 400 });

    const semester = await db.semester.findFirst({ where: { isActive: true }, select: { id: true } });
    if (!semester) return Response.json({ error: "No semester is active." }, { status: 400 });

    const created = await db.leaveRequest.create({
      data: {
        studentId: student.id,
        classId: enrollment.class.id,
        semesterId: semester.id,
        type,
        fromDate: from,
        toDate: to,
        reason,
        status: "PENDING_TEACHER",
      },
      include: LEAVE_INCLUDE,
    });

    return Response.json(toLeaveDto(created), { status: 201 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
