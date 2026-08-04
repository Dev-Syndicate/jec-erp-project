// /api/promotion — end-of-year advancement for a whole class at once.
//
// GET  ?classId=  → the context for promoting one source class: its roster
//   (active students enrolled for the ACTIVE year), the degree's final-year flag,
//   the academic years you can promote INTO, and the year-(N+1) classes to land
//   in (with the same-section suggestion).
// POST { sourceClassId, mode, targetYearId?, targetClassId?, studentIds } →
//   PROMOTE: upsert an Enrollment for each student in the target year + class (a
//   new "yearly sticker"; old rows stay as history). GRADUATE (final year only):
//   mark students GRADUATED and disable their login.
//
// Super-Admin only — a year transition, like the Academic slice. The Enrollment
// model is unchanged; promotion just adds next-year rows.
//
// Promotion is also the one place a student CHANGES DEPARTMENT: first year is
// owned by S&H, year 2+ by the branch's department. The award (programId) is what
// stays fixed — see the target-class check in POST.
import { authenticate, invalidateAuthUser, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

async function activeYear() {
  return db.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true, startDate: true },
  });
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "all");

    const classId = new URL(req.url).searchParams.get("classId")?.trim();
    if (!classId) return Response.json({ error: "Select a class." }, { status: 400 });

    const klass = await db.class.findUnique({
      where: { id: classId },
      include: {
        program: { include: { degree: true, branch: true } },
        // The class's OWNER, which is not the same question as its award: a
        // year-1 class is owned by S&H while its award is B.E · CSE. The UI
        // shows the hand-off, so both halves have to come back.
        department: { select: { code: true, name: true } },
      },
    });
    if (!klass) return Response.json({ error: "Class not found." }, { status: 404 });

    const active = await activeYear();
    if (!active) {
      return Response.json(
        { error: "No academic year is active. Activate one before promoting students." },
        { status: 400 },
      );
    }

    const durationYears = klass.program.degree.durationYears;
    const isFinalYear = klass.year >= durationYears;
    const programLabel = `${klass.program.degree.code} · ${klass.program.branch.code}`;

    // Academic years you can promote into — any year other than the active one,
    // ordered by start. The suggestion is the earliest that starts after it.
    const otherYears = await db.academicYear.findMany({
      where: { id: { not: active.id } },
      orderBy: { startDate: "asc" },
      select: { id: true, name: true, startDate: true },
    });
    const suggestedTargetYearId =
      otherYears.find((y) => y.startDate > active.startDate)?.id ?? null;

    // Where they land: year-(N+1) classes for the same AWARD. Deliberately not
    // filtered by department — the year-2 class for an S&H-owned first year is
    // owned by the branch's department, and that is exactly the class we want to
    // offer. Its department comes back with it so the picker can say so.
    const targetRows = isFinalYear
      ? []
      : await db.class.findMany({
          where: { programId: klass.programId, year: klass.year + 1, isActive: true },
          orderBy: { section: "asc" },
          select: {
            id: true,
            year: true,
            section: true,
            departmentId: true,
            department: { select: { code: true, name: true } },
          },
        });
    const targetClasses = targetRows.map((c) => ({
      id: c.id,
      year: c.year,
      section: c.section,
      departmentId: c.departmentId,
      departmentCode: c.department.code,
      departmentName: c.department.name,
    }));
    const suggestedTargetClassId = targetClasses.find((c) => c.section === klass.section)?.id ?? null;

    // The roster to advance: active students enrolled in this class this year.
    const enrollments = await db.enrollment.findMany({
      where: { classId, academicYearId: active.id, student: { status: "ACTIVE" } },
      include: {
        student: { select: { id: true, registerNumber: true, user: { select: { displayName: true } } } },
      },
      orderBy: { student: { registerNumber: "asc" } },
    });

    return Response.json({
      sourceClass: {
        id: klass.id,
        programId: klass.programId,
        programLabel,
        // Who owns it TODAY. Paired with the target class's department the UI can
        // render the move ("S&H → CSE Department") instead of silently relocating
        // the roster into another department's reach.
        departmentId: klass.departmentId,
        departmentCode: klass.department.code,
        departmentName: klass.department.name,
        year: klass.year,
        section: klass.section,
        label: `${programLabel} · ${roman(klass.year)}-${klass.section}`,
        durationYears,
        isFinalYear,
      },
      activeYear: { id: active.id, name: active.name },
      targetYears: otherYears.map((y) => ({ id: y.id, name: y.name })),
      suggestedTargetYearId,
      targetClasses,
      suggestedTargetClassId,
      roster: enrollments.map((e) => ({
        studentId: e.student.id,
        registerNumber: e.student.registerNumber,
        displayName: e.student.user.displayName,
      })),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "all");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const sourceClassId = typeof body?.sourceClassId === "string" ? body.sourceClassId.trim() : "";
    const mode = body?.mode === "GRADUATE" ? "GRADUATE" : body?.mode === "PROMOTE" ? "PROMOTE" : null;
    const targetYearId = typeof body?.targetYearId === "string" ? body.targetYearId.trim() : "";
    const targetClassId = typeof body?.targetClassId === "string" ? body.targetClassId.trim() : "";
    const studentIds = Array.isArray(body?.studentIds)
      ? [...new Set(body.studentIds.filter((s): s is string => typeof s === "string" && s.trim() !== ""))]
      : [];

    if (!sourceClassId) return Response.json({ error: "Select a class." }, { status: 400 });
    if (!mode) return Response.json({ error: "Invalid action." }, { status: 400 });
    if (studentIds.length === 0) return Response.json({ error: "Select at least one student." }, { status: 400 });

    const source = await db.class.findUnique({
      where: { id: sourceClassId },
      include: { program: { include: { degree: true } } },
    });
    if (!source) return Response.json({ error: "Class not found." }, { status: 404 });

    const active = await activeYear();
    if (!active) return Response.json({ error: "No academic year is active." }, { status: 400 });

    // Every selected student must be on this class's active-year roster (active).
    const roster = await db.enrollment.findMany({
      where: { classId: sourceClassId, academicYearId: active.id, student: { status: "ACTIVE" } },
      select: { studentId: true },
    });
    const rosterIds = new Set(roster.map((r) => r.studentId));
    if (studentIds.some((id) => !rosterIds.has(id))) {
      return Response.json({ error: "A selected student isn't in this class." }, { status: 400 });
    }

    const isFinalYear = source.year >= source.program.degree.durationYears;

    if (mode === "GRADUATE") {
      if (!isFinalYear) {
        return Response.json({ error: "Only final-year students graduate." }, { status: 400 });
      }
      const students = await db.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, user: { select: { id: true, firebaseUid: true } } },
      });
      await db.$transaction(async (tx) => {
        for (const s of students) {
          await tx.student.update({ where: { id: s.id }, data: { status: "GRADUATED" } });
          await tx.user.update({ where: { id: s.user.id }, data: { status: "INACTIVE" } });
        }
      });
      // Graduated logins are disabled — revoke immediately, don't wait out the TTL.
      for (const s of students) invalidateAuthUser(s.user.firebaseUid);
      return Response.json({ processed: students.length, mode });
    }

    // PROMOTE
    if (isFinalYear) {
      return Response.json(
        { error: "This is the final year — graduate these students instead." },
        { status: 400 },
      );
    }
    if (!targetYearId) return Response.json({ error: "Select a target academic year." }, { status: 400 });
    if (targetYearId === active.id) {
      return Response.json({ error: "Promote into a different academic year." }, { status: 400 });
    }
    const year = await db.academicYear.findUnique({ where: { id: targetYearId }, select: { id: true } });
    if (!year) return Response.json({ error: "Select a valid academic year." }, { status: 400 });

    if (!targetClassId) return Response.json({ error: "Select a target class." }, { status: 400 });
    // THE CROSS-DEPARTMENT HAND-OFF. Two facts about the target are checked, and
    // a third is deliberately NOT:
    //
    //   programId  MUST match. A student keeps their award — you are promoted
    //              within B.E · CSE, never into a different degree or branch.
    //   year       MUST be source + 1. Promotion advances exactly one year.
    //   departmentId  MAY DIFFER, and at the year-1 → year-2 boundary it always
    //              does. Science & Humanities owns every branch's first year;
    //              from year 2 the branch's own department owns the class. So
    //              promoting I-A → II-A moves the roster out of S&H's reach and
    //              into CSE Department's, and that transfer of ownership IS the
    //              promotion. Do not "fix" this by adding a departmentId equality
    //              check — it would make first-year students unpromotable.
    //
    // Ownership is never written here: a student's department is derived from
    // whichever department owns the class their current Enrollment points at, so
    // landing the new enrollment in the year-2 class moves them by construction.
    const target = await db.class.findUnique({
      where: { id: targetClassId },
      select: { programId: true, year: true, departmentId: true },
    });
    if (!target || target.programId !== source.programId || target.year !== source.year + 1) {
      return Response.json(
        { error: "The target class must be the next year of the same program." },
        { status: 400 },
      );
    }

    // A new yearly sticker per student for the target year (upsert = safe re-run).
    await db.$transaction(
      studentIds.map((studentId) =>
        db.enrollment.upsert({
          where: { studentId_academicYearId: { studentId, academicYearId: targetYearId } },
          update: { classId: targetClassId },
          create: { studentId, classId: targetClassId, academicYearId: targetYearId },
        }),
      ),
    );

    // Report the owning department the roster landed in — it may not be the one
    // it left (see the hand-off note above), and the caller should be able to say so.
    return Response.json({ processed: studentIds.length, mode, departmentId: target.departmentId });
  } catch (err) {
    return toAuthResponse(err);
  }
}
