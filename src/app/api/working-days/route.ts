// /api/working-days — declare which Saturdays the college works, and which
// weekday's timetable each one runs.
//
// GET  ?from=&to=  → the declared working Saturdays in a date range.
// POST { date, followsDay, note? } → declare (or re-point) one Saturday.
//
// Super Admin only: a working Saturday is an institution-wide decision, and
// declaring it once here is the whole point — before this each teacher picked a
// weekday while marking, so two could read different grids for the same date
// with nothing to flag it. `manage all` is the check (see CLAUDE.md: that pair
// means full/institution admin).
//
// Only Saturdays can be declared. Mon–Fri already run as themselves and Sunday
// is off, both decided in code (resolveWeekday) — storing a row for those would
// create a second, contradictable source of truth.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayName, isWeekday, parseDateOnly } from "../attendance/dto";

export const dynamic = "force-dynamic";

const INCLUDE = {
  declaredBy: { select: { displayName: true } },
} as const;

type Row = {
  id: string;
  date: Date;
  followsDay: string;
  note: string | null;
  declaredBy: { displayName: string } | null;
};

const toDto = (w: Row) => ({
  id: w.id,
  date: w.date.toISOString().slice(0, 10),
  followsDay: w.followsDay,
  note: w.note,
  declaredBy: w.declaredBy?.displayName ?? null,
});

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    // Any signed-in staff member may READ the declarations — the attendance
    // screen shows "this Saturday follows Wednesday" to whoever is marking.
    authorize(ctx, "read", "Attendance");

    const url = new URL(req.url);
    const from = parseDateOnly(url.searchParams.get("from")?.trim() ?? "");
    const to = parseDateOnly(url.searchParams.get("to")?.trim() ?? "");

    const days = await db.workingDay.findMany({
      where: from && to ? { date: { gte: from, lte: to } } : {},
      include: INCLUDE,
      orderBy: { date: "asc" },
    });

    return Response.json({ workingDays: days.map(toDto) });
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "all");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const dateStr = typeof body?.date === "string" ? body.date.trim() : "";
    const followsDay = body?.followsDay;
    const note = typeof body?.note === "string" && body.note.trim() !== "" ? body.note.trim() : null;

    const date = parseDateOnly(dateStr);
    if (!date) return Response.json({ error: "Pick a valid date." }, { status: 400 });
    if (dayName(date) !== "SAT") {
      return Response.json(
        { error: "Only a Saturday can be declared a working day — Mon–Fri already run their own timetable." },
        { status: 400 },
      );
    }
    if (!isWeekday(followsDay)) {
      return Response.json({ error: "Pick which weekday's timetable it follows." }, { status: 400 });
    }

    // Re-declaring the same date re-points it (the college moved which weekday
    // it covers) rather than erroring — `date` is unique.
    const saved = await db.workingDay.upsert({
      where: { date },
      create: { date, followsDay, note, declaredById: ctx.user.id },
      update: { followsDay, note, declaredById: ctx.user.id },
      include: INCLUDE,
    });

    return Response.json(toDto(saved));
  } catch (err) {
    return toAuthResponse(err);
  }
}
