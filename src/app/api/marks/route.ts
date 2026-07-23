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
import { assertMarksSubject } from "./access";

export const dynamic = "force-dynamic";

const ASSESSMENTS = ["IA1", "IA2", "MODEL", "ASSIGNMENT"] as const;
type Assessment = (typeof ASSESSMENTS)[number];

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

// Default out-of marks per assessment. The faculty can override on the grid; this
// is only the initial value for a fresh assessment.
export const DEFAULT_MAX: Record<Assessment, number> = {
  IA1: 100,
  IA2: 100,
  MODEL: 100,
  ASSIGNMENT: 20,
};

function isAssessment(v: unknown): v is Assessment {
  return typeof v === "string" && (ASSESSMENTS as readonly string[]).includes(v);
}

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

    await assertMarksSubject(ctx, { classId, subjectId, semesterId: semester.id, programId: klass.programId });

    const year = await db.academicYear.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
    if (!year) return Response.json({ error: "No academic year is active." }, { status: 400 });

    // Enrolled students for the active year, in register-number order, with their
    // existing mark for THIS assessment (if any).
    const enrollments = await db.enrollment.findMany({
      where: { classId, academicYearId: year.id },
      include: { student: { include: { user: { select: { displayName: true } } } } },
      orderBy: { student: { registerNumber: "asc" } },
    });

    const existing = await db.internalMark.findMany({
      where: { subjectId, semesterId: semester.id, assessment },
      select: { studentId: true, obtained: true, maxMark: true },
    });
    const byStudent = new Map(existing.map((m) => [m.studentId, m]));
    // The assessment's maxMark is shared; use the stored one if any row exists,
    // else the default for this assessment.
    const maxMark = existing[0] ? Number(existing[0].maxMark) : DEFAULT_MAX[assessment];

    return Response.json({
      classId,
      classLabel: `${klass.program.degree.code} · ${klass.program.branch.code} · ${roman(klass.year)}-${klass.section}`,
      subjectId,
      subjectLabel: `${subject.code} — ${subject.name}`,
      assessment,
      maxMark,
      academicYear: year.name,
      students: enrollments.map((e) => {
        const m = byStudent.get(e.studentId);
        return {
          studentId: e.studentId,
          registerNumber: e.student.registerNumber,
          rollNumber: e.student.rollNumber,
          displayName: e.student.user.displayName,
          obtained: m ? Number(m.obtained) : null,
        };
      }),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}

type MarkInput = { studentId: string; obtained: number };

function parseBody(body: unknown):
  | { classId: string; subjectId: string; assessment: Assessment; maxMark: number; marks: MarkInput[] }
  | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const classId = typeof b.classId === "string" ? b.classId.trim() : "";
  const subjectId = typeof b.subjectId === "string" ? b.subjectId.trim() : "";
  if (!classId || !subjectId) return { error: "Class and subject are required." };
  if (!isAssessment(b.assessment)) return { error: "Invalid assessment." };

  const maxMark = typeof b.maxMark === "number" ? b.maxMark : Number(b.maxMark);
  if (!Number.isFinite(maxMark) || maxMark <= 0) return { error: "Max mark must be a positive number." };

  if (!Array.isArray(b.marks)) return { error: "Marks must be a list." };
  const marks: MarkInput[] = [];
  for (const raw of b.marks) {
    if (!raw || typeof raw !== "object") return { error: "Invalid mark entry." };
    const r = raw as Record<string, unknown>;
    const studentId = typeof r.studentId === "string" ? r.studentId.trim() : "";
    if (!studentId) return { error: "Every mark needs a student." };
    // A blank cell (null/"") means "no mark entered" — skip it, don't store a 0.
    if (r.obtained === null || r.obtained === undefined || r.obtained === "") continue;
    const obtained = typeof r.obtained === "number" ? r.obtained : Number(r.obtained);
    if (!Number.isFinite(obtained) || obtained < 0) return { error: "Marks must be zero or more." };
    if (obtained > maxMark) return { error: `A mark exceeds the maximum of ${maxMark}.` };
    marks.push({ studentId, obtained });
  }

  return { classId, subjectId, assessment: b.assessment, maxMark, marks };
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "enter", "Marks");

    const parsed = parseBody(await req.json().catch(() => null));
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    const { classId, subjectId, assessment, maxMark, marks } = parsed;

    const rc = await resolveContext(classId, subjectId);
    if ("error" in rc) return Response.json({ error: rc.error }, { status: rc.status });
    const { klass, semester } = rc;

    await assertMarksSubject(ctx, { classId, subjectId, semesterId: semester.id, programId: klass.programId });

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

    // Upsert every submitted mark as one unit (unique student+subject+semester+
    // assessment). maxMark is stored on each row so the assessment's out-of value
    // stays with the data.
    await db.$transaction(
      marks.map((m) =>
        db.internalMark.upsert({
          where: {
            studentId_subjectId_semesterId_assessment: {
              studentId: m.studentId,
              subjectId,
              semesterId: semester.id,
              assessment,
            },
          },
          create: {
            studentId: m.studentId,
            subjectId,
            semesterId: semester.id,
            assessment,
            maxMark,
            obtained: m.obtained,
            markedById: ctx.user.id,
          },
          update: { maxMark, obtained: m.obtained, markedById: ctx.user.id },
        }),
      ),
    );

    return Response.json({ saved: marks.length });
  } catch (err) {
    return toAuthResponse(err);
  }
}
