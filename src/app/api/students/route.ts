// /api/students — list + provision students. A student is a Firebase-linked User
// + a Student record; provisioning creates the Firebase identity first, then the
// Neon rows in a transaction (src/lib/provisioning.ts), rolling back Firebase if
// the DB write fails. Program-scoped: Super Admin sees all; others their program.
//
// Open to Super Admin (all programs) and HOD (their own program only), enforced
// by the program-scoped `where` + assertProgramScope below.
import { authenticate, assertProgramScope, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { provisionStudentAccount } from "@/lib/provisioning";
import { STUDENT_INCLUDE, toStudentDto } from "./dto";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ParsedStudent = {
  email: string;
  displayName: string;
  programId: string;
  classId: string;
  registerNumber: string;
  rollNumber: string | null;
  dateOfBirth: string;
  phone: string;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
};

function parseStudentBody(body: unknown): { data: ParsedStudent } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) return { error: "A valid email is required." };

  const displayName = typeof b.displayName === "string" ? b.displayName.trim() : "";
  if (!displayName) return { error: "Name is required." };

  const programId = typeof b.programId === "string" ? b.programId.trim() : "";
  if (!programId) return { error: "Program is required." };

  // Class is optional — placing the student now is the common path (one step),
  // but they can be added first and placed later via "Change class".
  const classId = typeof b.classId === "string" ? b.classId.trim() : "";

  const registerNumber = typeof b.registerNumber === "string" ? b.registerNumber.trim() : "";
  if (!registerNumber) return { error: "Register number is required." };

  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  if (!phone) return { error: "Phone is required." };

  const dob = typeof b.dateOfBirth === "string" ? b.dateOfBirth : "";
  if (!dob || Number.isNaN(new Date(dob).getTime())) return { error: "Date of birth is invalid." };

  const rollNumber =
    typeof b.rollNumber === "string" && b.rollNumber.trim() !== "" ? b.rollNumber.trim() : null;

  const gender =
    b.gender === "MALE" || b.gender === "FEMALE" || b.gender === "OTHER" ? b.gender : null;

  return {
    data: { email, displayName, programId, classId, registerNumber, rollNumber, dateOfBirth: dob, phone, gender },
  };
}

// firebase-admin flags an already-registered email with this code.
function isFirebaseEmailTaken(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "auth/email-already-exists"
  );
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Student");

    // Super Admin: all students. Scoped roles: only their own program.
    const where = ctx.isInstitutionScoped
      ? {}
      : { user: { programId: ctx.user.programId ?? "__none__" } };

    const students = await db.student.findMany({
      where,
      include: STUDENT_INCLUDE,
      orderBy: { registerNumber: "asc" },
    });

    return Response.json(students.map(toStudentDto));
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Student");

    const body = await req.json().catch(() => null);
    const parsed = parseStudentBody(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    // Can only provision into a program you're allowed to act in.
    assertProgramScope(ctx, parsed.data.programId);

    const studentRole = await db.role.findUnique({ where: { name: "Student" }, select: { id: true } });
    if (!studentRole) {
      return Response.json({ error: "Student role is not seeded. Run the seed." }, { status: 500 });
    }

    // Guard the program exists (a clean 400 rather than a provisioning failure
    // after the Firebase user is already created).
    const program = await db.program.findUnique({
      where: { id: parsed.data.programId },
      select: { id: true },
    });
    if (!program) return Response.json({ error: "Select a valid program." }, { status: 400 });

    // If a class was chosen, validate it's in the same program and enroll the
    // student for the active academic year — atomically with the account.
    let enrollment: { classId: string; academicYearId: string } | undefined;
    if (parsed.data.classId) {
      const klass = await db.class.findUnique({
        where: { id: parsed.data.classId },
        select: { programId: true },
      });
      if (!klass || klass.programId !== parsed.data.programId) {
        return Response.json({ error: "Select a valid class in this program." }, { status: 400 });
      }
      const activeYear = await db.academicYear.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      if (!activeYear) {
        return Response.json(
          { error: "No academic year is active. Activate one before placing students in a class." },
          { status: 400 },
        );
      }
      enrollment = { classId: parsed.data.classId, academicYearId: activeYear.id };
    }

    let result;
    try {
      result = await provisionStudentAccount({
        email: parsed.data.email,
        displayName: parsed.data.displayName,
        programId: parsed.data.programId,
        roleId: studentRole.id,
        registerNumber: parsed.data.registerNumber,
        rollNumber: parsed.data.rollNumber,
        dateOfBirth: parsed.data.dateOfBirth,
        phone: parsed.data.phone,
        gender: parsed.data.gender,
        enrollment,
      });
    } catch (e) {
      if (isFirebaseEmailTaken(e)) {
        return Response.json({ error: "An account with that email already exists." }, { status: 409 });
      }
      if (isUniqueViolation(e)) {
        return Response.json(
          { error: "That register number or roll number is already in use." },
          { status: 409 },
        );
      }
      throw e;
    }

    const student = await db.student.findUniqueOrThrow({
      where: { id: result.studentId },
      include: STUDENT_INCLUDE,
    });

    return Response.json(
      { student: toStudentDto(student), tempPassword: result.tempPassword },
      { status: 201 },
    );
  } catch (err) {
    return toAuthResponse(err);
  }
}
