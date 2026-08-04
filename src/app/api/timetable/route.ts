// /api/timetable — read a class's weekly grid (GET ?classId=) + upsert one cell
// (POST). Open to Super Admin (all departments) and HOD (the classes their own
// department OWNS), department-scoped via a scoped authorize (resource form) —
// `Timetable` sits on the department axis, so a `{ programId }` resource would
// match no grant and fail closed. The grid is always for the ACTIVE semester; a
// slot's subject must be in the class's PROGRAM (the award — a different axis) and
// its faculty must be an active user of that program.
//
// Auth is the CLAUDE.md two-step: authenticate() (who) then authorize() (may) — CASL grants, not role names.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { curriculumSemester, roman, SLOT_INCLUDE, toSlotDto } from "./dto";

export const dynamic = "force-dynamic";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;
type Day = (typeof DAYS)[number];

// Resolve the single active semester (with its year). Returns null if none.
function activeSemester() {
  return db.semester.findFirst({
    where: { isActive: true },
    include: { academicYear: { select: { name: true } } },
  });
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Timetable");

    const classId = new URL(req.url).searchParams.get("classId")?.trim();
    if (!classId) return Response.json({ error: "Select a class." }, { status: 400 });

    // NOTE: this stays sequential on purpose — the scope check below needs
    // klass.departmentId before we're allowed to read the class's slots.
    const klass = await db.class.findUnique({
      relationLoadStrategy: "join",
      where: { id: classId },
      include: { program: { include: { degree: true, branch: true } } },
    });
    if (!klass) return Response.json({ error: "Class not found." }, { status: 404 });
    // Scoped on the class's OWNING department, not its award: whoever runs the
    // class builds its grid, so a year-1 B.E·CSE class is S&H's to timetable.
    authorize(ctx, "manage", "Timetable", { departmentId: klass.departmentId });

    const semester = await activeSemester();
    if (!semester) {
      return Response.json(
        { error: "No academic semester is active. Activate one before building a timetable." },
        { status: 400 },
      );
    }

    const slots = await db.timetableSlot.findMany({
      relationLoadStrategy: "join",
      where: { classId, semesterId: semester.id },
      include: SLOT_INCLUDE,
    });

    return Response.json({
      classId,
      classLabel: `${klass.program.degree.code} · ${klass.program.branch.code} · ${roman(klass.year)}-${klass.section}`,
      semesterId: semester.id,
      semesterLabel: `${semester.academicYear.name} · ${semester.kind === "ODD" ? "Odd" : "Even"}`,
      curriculumSemesterNumber: curriculumSemester(klass.year, semester.kind),
      slots: slots.map(toSlotDto),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Timetable");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const classId = typeof body?.classId === "string" ? body.classId.trim() : "";
    const dayOfWeek = body?.dayOfWeek as Day;
    const period = body?.period;
    const subjectId = typeof body?.subjectId === "string" ? body.subjectId.trim() : "";
    const facultyId = typeof body?.facultyId === "string" ? body.facultyId.trim() : "";

    if (!classId) return Response.json({ error: "Select a class." }, { status: 400 });
    if (!DAYS.includes(dayOfWeek)) return Response.json({ error: "Invalid day." }, { status: 400 });
    if (typeof period !== "number" || !Number.isInteger(period) || period < 1 || period > 8) {
      return Response.json({ error: "Period must be 1–8." }, { status: 400 });
    }
    if (!subjectId) return Response.json({ error: "Select a subject." }, { status: 400 });
    if (!facultyId) return Response.json({ error: "Select a faculty." }, { status: 400 });

    const klass = await db.class.findUnique({
      where: { id: classId },
      select: { programId: true, departmentId: true },
    });
    if (!klass) return Response.json({ error: "Class not found." }, { status: 404 });
    // Owner runs the class: the department that owns it timetables it (year-1 is
    // S&H-owned). programId is still selected — it's the AWARD, used below to keep
    // the subject and faculty inside the class's own program.
    authorize(ctx, "manage", "Timetable", { departmentId: klass.departmentId });

    const semester = await activeSemester();
    if (!semester) {
      return Response.json({ error: "No academic semester is active." }, { status: 400 });
    }

    // The subject must belong to the class's program.
    const subject = await db.subject.findUnique({ where: { id: subjectId }, select: { programId: true } });
    if (!subject || subject.programId !== klass.programId) {
      return Response.json({ error: "That subject isn't in this class's program." }, { status: 400 });
    }

    // The faculty must be active staff of the department that OWNS this class.
    //
    // Department, not program: a first-year class is owned by S&H and taught by
    // S&H staff, who have no program at all — comparing programs would have made
    // it impossible to put anyone on a first-year grid.
    const faculty = await db.user.findUnique({
      where: { id: facultyId },
      select: { status: true, facultyProfile: { select: { departmentId: true } } },
    });
    if (!faculty || !faculty.facultyProfile || faculty.status !== "ACTIVE") {
      return Response.json({ error: "Select an active faculty member." }, { status: 400 });
    }
    if (faculty.facultyProfile.departmentId !== klass.departmentId) {
      return Response.json(
        { error: "That faculty isn't in the department that owns this class." },
        { status: 400 },
      );
    }

    const slot = await db.timetableSlot.upsert({
      where: {
        classId_semesterId_dayOfWeek_period: {
          classId,
          semesterId: semester.id,
          dayOfWeek,
          period,
        },
      },
      update: { subjectId, facultyId },
      create: { classId, semesterId: semester.id, dayOfWeek, period, subjectId, facultyId },
      include: SLOT_INCLUDE,
    });

    return Response.json(toSlotDto(slot), { status: 201 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
