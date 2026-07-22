// /api/faculty — list + provision faculty. A faculty member is a Firebase-linked
// User + a FacultyProfile record; provisioning creates the Firebase identity
// first, then the Neon rows in a transaction (src/lib/provisioning.ts), rolling
// back Firebase if the DB write fails. Program-scoped: Super Admin sees all;
// others their program. Faculty log in with email (no register number).
//
// Open to Super Admin (all programs) and HOD (their own program only), enforced
// by the program-scoped `where` + assertProgramScope below.
import { authenticate, assertProgramScope, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { provisionFacultyAccount } from "@/lib/provisioning";
import { FACULTY_INCLUDE, toFacultyDto, validateAssignableRoles } from "./dto";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ParsedFaculty = {
  email: string;
  displayName: string;
  programId: string;
  roleIds: string[];
  staffId: string;
  designation: string;
  phone: string;
  emergencyPhone: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth: string | null;
  maritalStatus: "SINGLE" | "MARRIED" | "OTHER" | null;
  fatherName: string | null;
  motherName: string | null;
};

function parseFacultyBody(body: unknown): { data: ParsedFaculty } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) return { error: "A valid email is required." };

  const displayName = typeof b.displayName === "string" ? b.displayName.trim() : "";
  if (!displayName) return { error: "Name is required." };

  const programId = typeof b.programId === "string" ? b.programId.trim() : "";
  if (!programId) return { error: "Program is required." };

  const roleIds = Array.isArray(b.roleIds)
    ? [...new Set(
        b.roleIds
          .filter((r): r is string => typeof r === "string" && r.trim() !== "")
          .map((r) => r.trim()),
      )]
    : [];
  if (roleIds.length === 0) return { error: "Select at least one role." };

  const staffId = typeof b.staffId === "string" ? b.staffId.trim() : "";
  if (!staffId) return { error: "Staff ID is required." };

  const designation = typeof b.designation === "string" ? b.designation.trim() : "";
  if (!designation) return { error: "Designation is required." };

  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  if (!phone) return { error: "Phone is required." };

  const emergencyPhone =
    typeof b.emergencyPhone === "string" && b.emergencyPhone.trim() !== ""
      ? b.emergencyPhone.trim()
      : null;

  const gender =
    b.gender === "MALE" || b.gender === "FEMALE" || b.gender === "OTHER" ? b.gender : null;

  let dateOfBirth: string | null = null;
  if (typeof b.dateOfBirth === "string" && b.dateOfBirth !== "") {
    if (Number.isNaN(new Date(b.dateOfBirth).getTime())) {
      return { error: "Date of birth is invalid." };
    }
    dateOfBirth = b.dateOfBirth;
  }

  const maritalStatus =
    b.maritalStatus === "SINGLE" || b.maritalStatus === "MARRIED" || b.maritalStatus === "OTHER"
      ? b.maritalStatus
      : null;

  const fatherName =
    typeof b.fatherName === "string" && b.fatherName.trim() !== "" ? b.fatherName.trim() : null;
  const motherName =
    typeof b.motherName === "string" && b.motherName.trim() !== "" ? b.motherName.trim() : null;

  return {
    data: {
      email,
      displayName,
      programId,
      roleIds,
      staffId,
      designation,
      phone,
      emergencyPhone,
      gender,
      dateOfBirth,
      maritalStatus,
      fatherName,
      motherName,
    },
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
    authorize(ctx, "manage", "Faculty");

    // Super Admin: all faculty. Scoped roles: only their own program.
    const where = ctx.isInstitutionScoped
      ? {}
      : { user: { programId: ctx.user.programId ?? "__none__" } };

    const faculty = await db.facultyProfile.findMany({
      where,
      include: FACULTY_INCLUDE,
      orderBy: { staffId: "asc" },
    });

    return Response.json(faculty.map(toFacultyDto));
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Faculty");

    const body = await req.json().catch(() => null);
    const parsed = parseFacultyBody(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    // Can only provision into a program you're allowed to act in.
    assertProgramScope(ctx, parsed.data.programId);

    // Validate the chosen roles are assignable (exist, PROGRAM-scoped, not Student)
    // and don't grant more than the actor has.
    const roleCheck = await validateAssignableRoles(parsed.data.roleIds, ctx);
    if ("error" in roleCheck) return Response.json({ error: roleCheck.error }, { status: 400 });

    // Guard the program exists (a clean 400 rather than a provisioning failure
    // after the Firebase user is already created).
    const program = await db.program.findUnique({
      where: { id: parsed.data.programId },
      select: { id: true },
    });
    if (!program) return Response.json({ error: "Select a valid program." }, { status: 400 });

    let result;
    try {
      result = await provisionFacultyAccount({
        email: parsed.data.email,
        displayName: parsed.data.displayName,
        programId: parsed.data.programId,
        roleIds: roleCheck.ok,
        staffId: parsed.data.staffId,
        designation: parsed.data.designation,
        phone: parsed.data.phone,
        emergencyPhone: parsed.data.emergencyPhone,
        gender: parsed.data.gender,
        dateOfBirth: parsed.data.dateOfBirth,
        maritalStatus: parsed.data.maritalStatus,
        fatherName: parsed.data.fatherName,
        motherName: parsed.data.motherName,
      });
    } catch (e) {
      if (isFirebaseEmailTaken(e)) {
        return Response.json({ error: "An account with that email already exists." }, { status: 409 });
      }
      if (isUniqueViolation(e)) {
        return Response.json({ error: "That staff ID is already in use." }, { status: 409 });
      }
      throw e;
    }

    const faculty = await db.facultyProfile.findUniqueOrThrow({
      where: { id: result.facultyProfileId },
      include: FACULTY_INCLUDE,
    });

    return Response.json(
      { faculty: toFacultyDto(faculty), tempPassword: result.tempPassword },
      { status: 201 },
    );
  } catch (err) {
    return toAuthResponse(err);
  }
}
