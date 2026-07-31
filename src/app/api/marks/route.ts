// /api/marks — enter + read internal marks for one (class, subject, assessment) in
// the ACTIVE semester. The marks entry grid: one row per enrolled student, one
// obtained value against a shared maxMark.
//
// GET  ?classId&subjectId&assessment → the class's students + any existing marks
//      for that assessment (so the grid pre-fills).
// POST { classId, subjectId, assessment, maxMark, marks:[{studentId, obtained}] }
//      → bulk upsert (unique student+subject+semester+assessment), stamping
//      markedById. Transactional so the whole assessment saves atomically.
//
// Authorized by assertMarksSubject: the assigned faculty for this exact tuple, or a
// marks admin (HOD/SA) in program scope. Marks are always the active semester's —
// there's no back-dating a closed term here.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertEntersMarks, assertReadsMarks, teachesSubject } from "./access";
import {
  COMPONENT_LABEL,
  COMPONENT_MAX,
  assessmentTotal,
  componentsOf,
  isAssessment,
  type Assessment,
  type Component,
} from "./scheme";

export const dynamic = "force-dynamic";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

// Load the class + subject and confirm they pair within one program (a subject is
// per-program; a class belongs to a program). Returns the shared programId + the
// active semester, or an error tuple the caller maps to a 4xx.
async function resolveContext(classId: string, subjectId: string) {
  const [klass, subject, semester] = await Promise.all([
    db.class.findUnique({
      where: { id: classId },
      include: { program: { include: { degree: true, branch: true } } },
    }),
    db.subject.findUnique({ where: { id: subjectId }, select: { id: true, programId: true, name: true, code: true } }),
    db.semester.findFirst({ where: { isActive: true }, select: { id: true } }),
  ]);
  if (!klass) return { error: "Class not found.", status: 404 as const };
  if (!subject) return { error: "Subject not found.", status: 404 as const };
  if (subject.programId !== klass.programId) {
    return { error: "That subject isn't in this class's program.", status: 400 as const };
  }
  if (!semester) return { error: "No semester is active. Activate one first.", status: 400 as const };
  return { klass, subject, semester };
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "read", "Marks");

    const url = new URL(req.url);
    const classId = url.searchParams.get("classId")?.trim() ?? "";
    const subjectId = url.searchParams.get("subjectId")?.trim() ?? "";
    const assessment = url.searchParams.get("assessment")?.trim() ?? "";
    if (!classId || !subjectId) return Response.json({ error: "Pick a class and subject." }, { status: 400 });
    if (!isAssessment(assessment)) return Response.json({ error: "Invalid assessment." }, { status: 400 });

    const rc = await resolveContext(classId, subjectId);
    if ("error" in rc) return Response.json({ error: rc.error }, { status: rc.status });
    const { klass, subject, semester } = rc;

    // Read gate: the subject's teacher, or a HOD/SA overseeing the program.
    await assertReadsMarks(ctx, { classId, subjectId, semesterId: semester.id, programId: klass.programId });
    // Whether THIS viewer may also SAVE, so the grid opens read-only for a HOD
    // looking at someone else's subject instead of letting them edit-then-403.
    const canEnter = await teachesSubject(ctx, {
      classId,
      subjectId,
      semesterId: semester.id,
      programId: klass.programId,
    });

    const year = await db.academicYear.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
    if (!year) return Response.json({ error: "No academic year is active." }, { status: 400 });

    // Enrolled students for the active year, in register-number order, with their
    // existing mark for THIS assessment (if any).
    const enrollments = await db.enrollment.findMany({
      where: { classId, academicYearId: year.id },
      include: { student: { include: { user: { select: { displayName: true } } } } },
      orderBy: { student: { registerNumber: "asc" } },
    });

    // One row per COMPONENT per student (IA1 = 5 rows, MODEL = 1), so fetch the
    // whole set for this assessment and key them by student → component.
    const components = componentsOf(assessment);
    const existing = await db.internalMark.findMany({
      where: { subjectId, semesterId: semester.id, assessment: { in: components } },
      select: { studentId: true, assessment: true, obtained: true },
    });
    const byStudent = new Map<string, Map<string, number>>();
    for (const m of existing) {
      const row = byStudent.get(m.studentId) ?? new Map<string, number>();
      row.set(m.assessment, Number(m.obtained));
      byStudent.set(m.studentId, row);
    }

    return Response.json({
      classId,
      classLabel: `${klass.program.degree.code} · ${klass.program.branch.code} · ${roman(klass.year)}-${klass.section}`,
      subjectId,
      subjectLabel: `${subject.code} — ${subject.name}`,
      assessment,
      // The grid's columns, with each one's fixed maximum. Sent from the server so
      // the client never hard-codes the scheme in a second place.
      components: components.map((c) => ({
        key: c,
        label: COMPONENT_LABEL[c],
        max: COMPONENT_MAX[c],
      })),
      total: assessmentTotal(assessment),
      academicYear: year.name,
      // False when a HOD/SA is viewing a subject they don't teach — the grid
      // renders read-only rather than offering a save that would 403.
      canEnter,
      students: enrollments.map((e) => {
        const row = byStudent.get(e.studentId);
        const marks: Record<string, number | null> = {};
        for (const c of components) marks[c] = row?.get(c) ?? null;
        return {
          studentId: e.studentId,
          registerNumber: e.student.registerNumber,
          rollNumber: e.student.rollNumber,
          displayName: e.student.user.displayName,
          marks,
        };
      }),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}

// One cell of the grid: a student's mark for a single component.
type MarkInput = { studentId: string; component: Component; obtained: number };

export function parseBody(body: unknown):
  | { classId: string; subjectId: string; assessment: Assessment; marks: MarkInput[] }
  | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const classId = typeof b.classId === "string" ? b.classId.trim() : "";
  const subjectId = typeof b.subjectId === "string" ? b.subjectId.trim() : "";
  if (!classId || !subjectId) return { error: "Class and subject are required." };
  if (!isAssessment(b.assessment)) return { error: "Invalid assessment." };

  // The components this assessment is allowed to carry. A mark for anything else
  // (e.g. an IA2 column posted to IA1) is rejected rather than silently stored.
  const allowed = new Set<string>(componentsOf(b.assessment));

  if (!Array.isArray(b.marks)) return { error: "Marks must be a list." };
  const marks: MarkInput[] = [];
  const seen = new Set<string>();
  for (const raw of b.marks) {
    if (!raw || typeof raw !== "object") return { error: "Invalid mark entry." };
    const r = raw as Record<string, unknown>;
    const studentId = typeof r.studentId === "string" ? r.studentId.trim() : "";
    if (!studentId) return { error: "Every mark needs a student." };

    const component = typeof r.component === "string" ? r.component : "";
    if (!allowed.has(component)) return { error: "Invalid assessment component." };

    // A blank cell (null/"") means "no mark entered" — skip it, don't store a 0.
    if (r.obtained === null || r.obtained === undefined || r.obtained === "") continue;
    const obtained = typeof r.obtained === "number" ? r.obtained : Number(r.obtained);
    if (!Number.isFinite(obtained) || obtained < 0) return { error: "Marks must be zero or more." };

    // Each component has its OWN fixed maximum (10 for a cycle test or
    // assignment, 60 for the IAT paper) — the college scheme, not a per-subject
    // setting, so it's checked here rather than trusted from the client.
    const max = COMPONENT_MAX[component as Component];
    if (obtained > max) {
      return { error: `${COMPONENT_LABEL[component as Component]} is out of ${max}.` };
    }

    // The unique constraint is (student, subject, semester, assessment), so two
    // cells for the same pair would make the upserts fight each other.
    const key = `${studentId}::${component}`;
    if (seen.has(key)) return { error: "Duplicate mark for the same student and component." };
    seen.add(key);

    marks.push({ studentId, component: component as Component, obtained });
  }

  return { classId, subjectId, assessment: b.assessment, marks };
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "enter", "Marks");

    const parsed = parseBody(await req.json().catch(() => null));
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    // `assessment` isn't needed past parsing: parseBody already checked every
    // component belongs to it, and each mark carries its own component key.
    const { classId, subjectId, marks } = parsed;

    const rc = await resolveContext(classId, subjectId);
    if ("error" in rc) return Response.json({ error: rc.error }, { status: rc.status });
    const { klass, semester } = rc;

    // Write gate: the subject's own teacher only — a HOD may read these marks but
    // not record them (markedById must name whoever actually assessed the work).
    await assertEntersMarks(ctx, { classId, subjectId, semesterId: semester.id, programId: klass.programId });

    const year = await db.academicYear.findFirst({ where: { isActive: true }, select: { id: true } });
    if (!year) return Response.json({ error: "No academic year is active." }, { status: 400 });

    // Guard: every submitted student must actually be enrolled in this class this
    // year — no writing marks for someone outside the roster.
    const enrolled = new Set(
      (
        await db.enrollment.findMany({
          where: { classId, academicYearId: year.id },
          select: { studentId: true },
        })
      ).map((e) => e.studentId),
    );
    const stray = marks.find((m) => !enrolled.has(m.studentId));
    if (stray) return Response.json({ error: "A mark was submitted for a student not in this class." }, { status: 400 });

    // Upsert every submitted cell as one unit. The unique key is
    // (student, subject, semester, assessment) where `assessment` is the
    // COMPONENT — so a student's five IAT-1 parts are five independent rows and
    // correcting one never disturbs the others. maxMark is stored per row from
    // the fixed scheme, so each row records what it was out of.
    await db.$transaction(
      marks.map((m) =>
        db.internalMark.upsert({
          where: {
            studentId_subjectId_semesterId_assessment: {
              studentId: m.studentId,
              subjectId,
              semesterId: semester.id,
              assessment: m.component,
            },
          },
          create: {
            studentId: m.studentId,
            subjectId,
            semesterId: semester.id,
            assessment: m.component,
            maxMark: COMPONENT_MAX[m.component],
            obtained: m.obtained,
            markedById: ctx.user.id,
          },
          update: {
            maxMark: COMPONENT_MAX[m.component],
            obtained: m.obtained,
            markedById: ctx.user.id,
          },
        }),
      ),
    );

    return Response.json({ saved: marks.length });
  } catch (err) {
    return toAuthResponse(err);
  }
}
