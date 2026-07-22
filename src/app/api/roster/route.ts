// /api/roster — the class teacher's view + edit of the students in the class they
// advise (active academic year). The class teacher can see each student's full
// details and correct their detail fields (name, roll no., phone, DOB, gender).
// They CANNOT change identity (register number / email), lifecycle status, or move
// a student between classes — those stay with HOD/Admin (/api/students).
//
// GET   ?classId= → the class's enrolled students, full details.
// PATCH { studentId, ...detail fields } → update one student's detail fields.
//
// Authorized by assertManagesRoster (the class's own advisor, or a `manage Student`
// holder — HOD/Super Admin — in program scope).
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { STUDENT_INCLUDE, toStudentDto } from "@/app/api/students/dto";
import { assertManagesRoster } from "./access";

export const dynamic = "force-dynamic";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

async function loadClass(classId: string) {
  return db.class.findUnique({
    where: { id: classId },
    include: { program: { include: { degree: true, branch: true } } },
  });
}

function classLabel(k: NonNullable<Awaited<ReturnType<typeof loadClass>>>): string {
  return `${k.program.degree.code} · ${k.program.branch.code} · ${roman(k.year)}-${k.section}`;
}

function activeYear() {
  return db.academicYear.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);

    const classId = new URL(req.url).searchParams.get("classId")?.trim();
    if (!classId) return Response.json({ error: "Select a class." }, { status: 400 });

    const klass = await loadClass(classId);
    if (!klass) return Response.json({ error: "Class not found." }, { status: 404 });
    assertManagesRoster(ctx, klass);

    const year = await activeYear();
    if (!year) return Response.json({ error: "No academic year is active." }, { status: 400 });

    const enrollments = await db.enrollment.findMany({
      where: { classId, academicYearId: year.id },
      include: { student: { include: STUDENT_INCLUDE } },
      orderBy: { student: { registerNumber: "asc" } },
    });

    return Response.json({
      classId,
      classLabel: classLabel(klass),
      academicYear: year.name,
      students: enrollments.map((e) => toStudentDto(e.student)),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}

// Only the detail fields a class teacher may correct — NOT identity, status, or
// class placement.
type DetailPatch = {
  displayName?: string;
  rollNumber?: string | null;
  phone?: string;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth?: string;
};

function parsePatch(body: unknown): { data: DetailPatch } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;
  const data: DetailPatch = {};

  if (b.displayName !== undefined) {
    const v = typeof b.displayName === "string" ? b.displayName.trim() : "";
    if (!v) return { error: "Name can't be empty." };
    data.displayName = v;
  }
  if (b.rollNumber !== undefined) {
    data.rollNumber =
      typeof b.rollNumber === "string" && b.rollNumber.trim() !== "" ? b.rollNumber.trim() : null;
  }
  if (b.phone !== undefined) {
    const v = typeof b.phone === "string" ? b.phone.trim() : "";
    if (!v) return { error: "Phone can't be empty." };
    data.phone = v;
  }
  if (b.gender !== undefined) {
    data.gender =
      b.gender === "MALE" || b.gender === "FEMALE" || b.gender === "OTHER" ? b.gender : null;
  }
  if (b.dateOfBirth !== undefined) {
    if (typeof b.dateOfBirth !== "string" || Number.isNaN(new Date(b.dateOfBirth).getTime())) {
      return { error: "Date of birth is invalid." };
    }
    data.dateOfBirth = b.dateOfBirth;
  }

  if (Object.keys(data).length === 0) return { error: "Nothing to update." };
  return { data };
}

export async function PATCH(req: Request) {
  try {
    const ctx = await authenticate(req);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const studentId = typeof body?.studentId === "string" ? body.studentId.trim() : "";
    if (!studentId) return Response.json({ error: "A student is required." }, { status: 400 });

    const parsed = parsePatch(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    // The student's CURRENT class decides who may edit them — its advisor, or a
    // manage-Student admin in the program.
    const student = await db.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { programId: true } },
        enrollments: {
          where: { academicYear: { isActive: true } },
          include: { class: { select: { programId: true, advisorId: true } } },
          take: 1,
        },
      },
    });
    if (!student) return Response.json({ error: "Student not found." }, { status: 404 });

    const currentClass = student.enrollments[0]?.class;
    if (currentClass) {
      assertManagesRoster(ctx, currentClass);
    } else {
      // Not in a class this year — only an admin can edit.
      authorize(ctx, "manage", "Student", { programId: student.user.programId });
    }

    // displayName lives on the linked User; update it via a nested write so the
    // whole change is one atomic statement (no explicit transaction needed).
    const { displayName, dateOfBirth, ...studentFields } = parsed.data;
    const updated = await db.student.update({
      where: { id: studentId },
      data: {
        ...studentFields,
        ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
        ...(displayName !== undefined ? { user: { update: { displayName } } } : {}),
      },
      include: STUDENT_INCLUDE,
    });

    return Response.json(toStudentDto(updated));
  } catch (err) {
    return toAuthResponse(err);
  }
}
