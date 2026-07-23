// POST /api/leave/[id]/action — advance a request through the two-stage workflow.
//
// Body: { action: "approve" | "reject", rejectionReason? }
//
//   PENDING_TEACHER + approve  -> PENDING_HOD           (class teacher / admin)
//   PENDING_TEACHER + reject   -> REJECTED              (terminal)
//   PENDING_HOD     + approve  -> APPROVED + write attendance   (HOD / admin)
//   PENDING_HOD     + reject   -> REJECTED              (terminal)
//
// Only the FINAL HOD approval writes attendance, and it does so atomically with the
// status flip: for every date in [from,to] that is a weekday OR already has an
// attendance row (a working Saturday shows up as already-marked), upsert the
// MasterAttendance to OD/EXCUSED (manuallyAdjusted=true so period-1 re-marking
// won't clobber it) and update any existing PeriodAttendance rows for those dates.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertCanHodAct, assertCanTeacherAct } from "../../access";
import { eachDate, isWeekday, LEAVE_INCLUDE, toLeaveDto } from "../../dto";

export const dynamic = "force-dynamic";

const isAction = (v: unknown): v is "approve" | "reject" => v === "approve" || v === "reject";

// OD counts as present-equivalent (status OD); LEAVE is excused (neutral to %).
function attendanceStatusFor(type: "OD" | "LEAVE"): "OD" | "EXCUSED" {
  return type === "OD" ? "OD" : "EXCUSED";
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "approve", "Leave");
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const action = body?.action;
    const rejectionReason =
      typeof body?.rejectionReason === "string" ? body.rejectionReason.trim() : "";
    if (!isAction(action)) return Response.json({ error: "Invalid action." }, { status: 400 });
    if (action === "reject" && !rejectionReason) {
      return Response.json({ error: "A reason is required to reject." }, { status: 400 });
    }

    const request = await db.leaveRequest.findUnique({
      where: { id },
      include: { class: { select: { programId: true, advisorId: true } } },
    });
    if (!request) return Response.json({ error: "Request not found." }, { status: 404 });

    if (request.status === "APPROVED" || request.status === "REJECTED") {
      return Response.json({ error: "This request is already closed." }, { status: 409 });
    }

    const now = new Date();

    // --- Stage 1: class teacher acting on a PENDING_TEACHER request ---
    if (request.status === "PENDING_TEACHER") {
      assertCanTeacherAct(ctx, request.class);
      const updated = await db.leaveRequest.update({
        where: { id },
        data:
          action === "approve"
            ? { status: "PENDING_HOD", teacherActionById: ctx.user.id, teacherActionAt: now }
            : {
                status: "REJECTED",
                teacherActionById: ctx.user.id,
                teacherActionAt: now,
                rejectionReason,
              },
        include: LEAVE_INCLUDE,
      });
      return Response.json(toLeaveDto(updated));
    }

    // --- Stage 2: HOD acting on a PENDING_HOD request ---
    assertCanHodAct(ctx, request.class);

    if (action === "reject") {
      const updated = await db.leaveRequest.update({
        where: { id },
        data: { status: "REJECTED", hodActionById: ctx.user.id, hodActionAt: now, rejectionReason },
        include: LEAVE_INCLUDE,
      });
      return Response.json(toLeaveDto(updated));
    }

    // Final approval → write attendance atomically with the status flip.
    const status = attendanceStatusFor(request.type);
    const dates = eachDate(request.fromDate, request.toDate);

    // Which of those dates already have any attendance for this class (so a working
    // Saturday — marked but not a weekday — is still covered)?
    const marked = await db.masterAttendance.findMany({
      where: { classId: request.classId, date: { in: dates } },
      select: { date: true },
    });
    const markedSet = new Set(marked.map((m) => m.date.getTime()));
    const targetDates = dates.filter((d) => isWeekday(d) || markedSet.has(d.getTime()));

    const updated = await db.$transaction(async (tx) => {
      // 1) Whole-day master rows → OD/EXCUSED, flagged manuallyAdjusted.
      for (const date of targetDates) {
        await tx.masterAttendance.upsert({
          where: { studentId_date: { studentId: request.studentId, date } },
          update: { status, manuallyAdjusted: true, markedById: ctx.user.id },
          create: {
            studentId: request.studentId,
            classId: request.classId,
            semesterId: request.semesterId,
            date,
            status,
            manuallyAdjusted: true,
            markedById: ctx.user.id,
          },
        });
      }
      // 2) Any existing period rows for those dates → same status (don't fabricate
      //    period rows for subjects that were never scheduled/marked).
      if (targetDates.length > 0) {
        await tx.periodAttendance.updateMany({
          where: { studentId: request.studentId, date: { in: targetDates } },
          data: { status, markedById: ctx.user.id },
        });
      }
      // 3) Flip the request to APPROVED.
      return tx.leaveRequest.update({
        where: { id },
        data: { status: "APPROVED", hodActionById: ctx.user.id, hodActionAt: now },
        include: LEAVE_INCLUDE,
      });
    });

    return Response.json({ ...toLeaveDto(updated), daysMarked: targetDates.length });
  } catch (err) {
    return toAuthResponse(err);
  }
}
