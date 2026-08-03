// /api/attendance/substitutions — arrange cover for a period whose usual teacher
// is away, so the hour can still be marked.
//
// Marking a period is otherwise the slot teacher's alone (see ../access.ts), which
// left a class unable to record attendance on a day that teacher is absent. A
// substitution is a DATED grant: it names the covering teacher, the exact date and
// who arranged it, and it changes nothing about the permanent timetable.
//
// WHO ASSIGNS: `manage Attendance` in the class's program — HOD (own program) and
// Super Admin (anywhere). Deliberately NOT the class advisor and NOT self-service:
// granting someone the right to sign another teacher's register is a supervised
// act. A HOD still cannot mark the hour themselves; they can only assign someone.
//
// Auth is the CLAUDE.md two-step: authenticate() (who) then authorize() (may).
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayName, parseDateOnly, resolveWeekday, roman } from "../dto";

export const dynamic = "force-dynamic";

// The one active semester. Local (and id-only) — the sibling attendance route
// keeps its own copy because it also needs the academic-year label for display.
function activeSemesterId() {
  return db.semester.findFirst({ where: { isActive: true }, select: { id: true } });
}

type SlotWithClass = {
  id: string;
  period: number;
  facultyId: string;
  class: { id: string; programId: string; year: number; section: string };
  subject: { code: string; name: string };
  faculty: { displayName: string };
};

function slotDto(s: SlotWithClass) {
  return {
    slotId: s.id,
    period: s.period,
    subjectCode: s.subject.code,
    subjectName: s.subject.name,
    classId: s.class.id,
    classShort: `${roman(s.class.year)}-${s.class.section}`,
    regularFacultyId: s.facultyId,
    regularFacultyName: s.faculty.displayName,
  };
}

/**
 * GET ?classId=&date=YYYY-MM-DD — the day's periods for a class with any cover
 * already arranged, so the assigner sees the grid they're acting on.
 */
export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Attendance");

    const url = new URL(req.url);
    const classId = url.searchParams.get("classId")?.trim();
    const dateStr = url.searchParams.get("date")?.trim() ?? "";
    if (!classId) return Response.json({ error: "Select a class." }, { status: 400 });

    const date = parseDateOnly(dateStr);
    if (!date) return Response.json({ error: "Select a valid date." }, { status: 400 });

    const klass = await db.class.findUnique({
      where: { id: classId },
      select: { id: true, programId: true, year: true, section: true },
    });
    if (!klass) return Response.json({ error: "Class not found." }, { status: 404 });
    // Scoped: a HOD may only arrange cover inside their own program.
    authorize(ctx, "manage", "Attendance", { programId: klass.programId });

    const semester = await activeSemesterId();
    if (!semester) return Response.json({ error: "No academic semester is active." }, { status: 400 });

    // Same weekday resolution attendance uses — a working Saturday borrows a
    // weekday's grid, an undeclared Saturday and Sunday have no periods at all.
    const day = await resolveWeekday(date);
    if ("error" in day) return Response.json({ error: day.error }, { status: 400 });

    const slots = await db.timetableSlot.findMany({
      relationLoadStrategy: "join",
      where: { classId, semesterId: semester.id, dayOfWeek: day.weekday },
      include: {
        class: { select: { id: true, programId: true, year: true, section: true } },
        subject: { select: { code: true, name: true } },
        faculty: { select: { displayName: true } },
      },
      orderBy: { period: "asc" },
    });

    const covers = await db.slotSubstitution.findMany({
      relationLoadStrategy: "join",
      where: { date, slotId: { in: slots.map((s) => s.id) } },
      include: {
        substitute: { select: { id: true, displayName: true } },
        assignedBy: { select: { displayName: true } },
      },
    });
    const bySlot = new Map(covers.map((c) => [c.slotId, c]));

    return Response.json({
      classId,
      date: dateStr,
      weekday: day.weekday,
      ...(dayName(date) === "SAT" ? { followsDay: day.weekday } : {}),
      periods: slots.map((s) => {
        const cover = bySlot.get(s.id);
        return {
          ...slotDto(s),
          substitution: cover
            ? {
                id: cover.id,
                substituteId: cover.substitute.id,
                substituteName: cover.substitute.displayName,
                assignedByName: cover.assignedBy.displayName,
                reason: cover.reason,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}

/**
 * POST { slotId, date, substituteId, reason? } — assign (or reassign) cover for
 * one period on one date. Upserts on (slotId, date), so re-assigning replaces the
 * existing cover rather than stacking a second one.
 */
export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Attendance");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return Response.json({ error: "Missing request body." }, { status: 400 });

    const slotId = typeof body.slotId === "string" ? body.slotId.trim() : "";
    const substituteId = typeof body.substituteId === "string" ? body.substituteId.trim() : "";
    const dateStr = typeof body.date === "string" ? body.date.trim() : "";
    const reason =
      typeof body.reason === "string" && body.reason.trim() !== "" ? body.reason.trim() : null;

    if (!slotId) return Response.json({ error: "Select a period." }, { status: 400 });
    if (!substituteId) return Response.json({ error: "Select a covering teacher." }, { status: 400 });

    const date = parseDateOnly(dateStr);
    if (!date) return Response.json({ error: "Select a valid date." }, { status: 400 });

    const semester = await activeSemesterId();
    if (!semester) return Response.json({ error: "No academic semester is active." }, { status: 400 });

    const slot = await db.timetableSlot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        facultyId: true,
        semesterId: true,
        dayOfWeek: true,
        class: { select: { programId: true } },
      },
    });
    if (!slot) return Response.json({ error: "That period isn't on the timetable." }, { status: 404 });
    // Scoped: a HOD may only arrange cover inside their own program.
    authorize(ctx, "manage", "Attendance", { programId: slot.class.programId });

    // Cover belongs to the semester the slot is in — a stale slot id from a past
    // semester must not become a grant against today's timetable.
    if (slot.semesterId !== semester.id) {
      return Response.json({ error: "That period isn't in the active semester." }, { status: 400 });
    }

    // The date must actually run this slot's weekday, or the grant would cover an
    // hour that doesn't happen (a Sunday, an undeclared Saturday, or the wrong day).
    const day = await resolveWeekday(date);
    if ("error" in day) return Response.json({ error: day.error }, { status: 400 });

    if (slot.dayOfWeek !== day.weekday) {
      return Response.json(
        { error: "That period isn't scheduled on the chosen date." },
        { status: 400 },
      );
    }

    // Assigning the regular teacher to cover their own hour is a no-op that would
    // read as "someone else took it" — refuse it rather than store a confusing row.
    if (substituteId === slot.facultyId) {
      return Response.json(
        { error: "That teacher already takes this period." },
        { status: 400 },
      );
    }

    // The substitute must be an ACTIVE staff user of the same program — cover is
    // not a way to hand an outsider (or a deactivated account) marking rights.
    const substitute = await db.user.findUnique({
      where: { id: substituteId },
      select: { id: true, status: true, programId: true, student: { select: { id: true } } },
    });
    if (!substitute || substitute.status !== "ACTIVE") {
      return Response.json({ error: "Select an active member of staff." }, { status: 400 });
    }
    if (substitute.student) {
      return Response.json({ error: "A student can't cover a class." }, { status: 400 });
    }
    if (substitute.programId !== slot.class.programId) {
      return Response.json(
        { error: "The covering teacher must belong to the same program." },
        { status: 400 },
      );
    }

    const saved = await db.slotSubstitution.upsert({
      where: { slotId_date: { slotId, date } },
      create: { slotId, date, substituteId, assignedById: ctx.user.id, reason },
      update: { substituteId, assignedById: ctx.user.id, reason },
      include: { substitute: { select: { id: true, displayName: true } } },
    });

    return Response.json({
      id: saved.id,
      slotId: saved.slotId,
      date: dateStr,
      substituteId: saved.substitute.id,
      substituteName: saved.substitute.displayName,
      reason: saved.reason,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}

/**
 * DELETE ?slotId=&date= — remove cover (the teacher came in after all). The hour
 * reverts to its regular teacher; any attendance already marked is untouched,
 * since PeriodAttendance.markedById records who actually took it.
 */
export async function DELETE(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Attendance");

    const url = new URL(req.url);
    const slotId = url.searchParams.get("slotId")?.trim();
    const date = parseDateOnly(url.searchParams.get("date")?.trim() ?? "");
    if (!slotId || !date) {
      return Response.json({ error: "Select a period and a date." }, { status: 400 });
    }

    const existing = await db.slotSubstitution.findUnique({
      where: { slotId_date: { slotId, date } },
      select: { id: true, slot: { select: { class: { select: { programId: true } } } } },
    });
    if (!existing) return Response.json({ error: "No cover is arranged for that period." }, { status: 404 });
    authorize(ctx, "manage", "Attendance", { programId: existing.slot.class.programId });

    await db.slotSubstitution.delete({ where: { id: existing.id } });
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
