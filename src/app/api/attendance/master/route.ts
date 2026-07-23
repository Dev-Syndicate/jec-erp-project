// /api/attendance/master — the official DAY (Master) attendance for a class on a
// date, and the class teacher's correction of it.
//
// GET  ?classId=&date=  → the roster with each student's current day status (auto
//   from period 1, or a manual correction) so the class teacher can review + fix.
// POST { classId, date, entries:[{studentId,status}] } → set the day record
//   directly, flagging each touched row manuallyAdjusted=true so the period-1
//   auto-seed won't overwrite it later (Option C hybrid, see schema-design).
//
// This is the class teacher's domain: authorization needs `mark Attendance` +
// program scope + assertOwnsDayRecord (manage Attendance OR the class advisor) —
// a plain subject teacher can mark their period but not override the day record.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { assertOwnsDayRecord } from "../access";
import { isStatus, parseDateOnly, roman } from "../dto";

export const dynamic = "force-dynamic";

async function loadClass(classId: string) {
  return db.class.findUnique({
    where: { id: classId },
    include: { program: { include: { degree: true, branch: true } } },
  });
}

function classLabel(k: NonNullable<Awaited<ReturnType<typeof loadClass>>>): string {
  return `${k.program.degree.code} · ${k.program.branch.code} · ${roman(k.year)}-${k.section}`;
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "mark", "Attendance");

    const url = new URL(req.url);
    const classId = url.searchParams.get("classId")?.trim();
    const dateStr = url.searchParams.get("date")?.trim();
    if (!classId) return Response.json({ error: "Select a class." }, { status: 400 });
    if (!dateStr) return Response.json({ error: "Select a date." }, { status: 400 });
    const date = parseDateOnly(dateStr);
    if (!date) return Response.json({ error: "Invalid date." }, { status: 400 });

    const klass = await loadClass(classId);
    if (!klass) return Response.json({ error: "Class not found." }, { status: 404 });
    authorize(ctx, "mark", "Attendance", { programId: klass.programId });
    assertOwnsDayRecord(ctx, klass.advisorId);

    // Roster = students enrolled in this class for the active academic year.
    const enrollments = await db.enrollment.findMany({
      where: { classId, academicYear: { isActive: true } },
      include: {
        student: {
          select: {
            id: true,
            registerNumber: true,
            rollNumber: true,
            user: { select: { displayName: true } },
          },
        },
      },
      orderBy: { student: { registerNumber: "asc" } },
    });

    // The day's master rows (one per student per date), to prefill statuses.
    const master = await db.masterAttendance.findMany({
      where: { classId, date },
      select: { studentId: true, status: true, manuallyAdjusted: true },
    });
    const byStudent = new Map(master.map((m) => [m.studentId, m]));

    return Response.json({
      classId,
      classLabel: classLabel(klass),
      date: dateStr,
      roster: enrollments.map((e) => {
        const m = byStudent.get(e.student.id);
        return {
          studentId: e.student.id,
          registerNumber: e.student.registerNumber,
          rollNumber: e.student.rollNumber,
          displayName: e.student.user.displayName,
          status: m?.status ?? null,
          manuallyAdjusted: m?.manuallyAdjusted ?? false,
        };
      }),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "mark", "Attendance");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const classId = typeof body?.classId === "string" ? body.classId.trim() : "";
    const dateStr = typeof body?.date === "string" ? body.date.trim() : "";
    const rawEntries = Array.isArray(body?.entries) ? (body.entries as unknown[]) : null;

    if (!classId) return Response.json({ error: "Select a class." }, { status: 400 });
    if (!dateStr) return Response.json({ error: "Select a date." }, { status: 400 });
    const date = parseDateOnly(dateStr);
    if (!date) return Response.json({ error: "Invalid date." }, { status: 400 });
    if (!rawEntries || rawEntries.length === 0) {
      return Response.json({ error: "No students to update." }, { status: 400 });
    }

    const entries: Array<{ studentId: string; status: string }> = [];
    for (const raw of rawEntries) {
      const e = raw as Record<string, unknown>;
      const studentId = typeof e?.studentId === "string" ? e.studentId.trim() : "";
      const status = e?.status;
      if (!studentId || !isStatus(status)) {
        return Response.json({ error: "Every row needs a student and a valid status." }, { status: 400 });
      }
      entries.push({ studentId, status });
    }

    const klass = await db.class.findUnique({
      where: { id: classId },
      select: { programId: true, advisorId: true },
    });
    if (!klass) return Response.json({ error: "Class not found." }, { status: 404 });
    authorize(ctx, "mark", "Attendance", { programId: klass.programId });
    assertOwnsDayRecord(ctx, klass.advisorId);

    const semester = await db.semester.findFirst({ where: { isActive: true }, select: { id: true } });
    if (!semester) return Response.json({ error: "No academic semester is active." }, { status: 400 });

    // Every touched student must be on this class's active-year roster.
    const enrolled = await db.enrollment.findMany({
      where: { classId, academicYear: { isActive: true } },
      select: { studentId: true },
    });
    const rosterIds = new Set(enrolled.map((e) => e.studentId));
    const stray = entries.find((e) => !rosterIds.has(e.studentId));
    if (stray) {
      return Response.json({ error: "A student isn't enrolled in this class." }, { status: 400 });
    }

    const markedById = ctx.user.id;
    const semesterId = semester.id;

    // A manual correction: create-or-update each day row and flag it manuallyAdjusted
    // so period 1 won't overwrite it. Emulated bulk upsert (createMany + grouped
    // updateMany) instead of a per-student upsert loop: on Vercel the loop was
    // N round-trips to the Singapore DB in one interactive transaction and blew the
    // 20s timeout for a full class. N students → ≤ (1 + 4) statements.
    const byStatus = new Map<string, string[]>();
    for (const e of entries) {
      const ids = byStatus.get(e.status) ?? [];
      ids.push(e.studentId);
      byStatus.set(e.status, ids);
    }
    const ops: Prisma.PrismaPromise<unknown>[] = [
      db.masterAttendance.createMany({
        data: entries.map((e) => ({
          studentId: e.studentId,
          classId,
          semesterId,
          date,
          status: e.status as never,
          manuallyAdjusted: true,
          markedById,
        })),
        skipDuplicates: true,
      }),
    ];
    for (const [status, studentIds] of byStatus) {
      ops.push(
        db.masterAttendance.updateMany({
          where: { studentId: { in: studentIds }, date },
          data: { status: status as never, manuallyAdjusted: true, markedById },
        }),
      );
    }
    await db.$transaction(ops);

    return Response.json({ saved: entries.length }, { status: 200 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
