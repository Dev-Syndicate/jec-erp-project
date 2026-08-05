// /api/faculty — list + provision faculty. A faculty member is a Firebase-linked
// User + a FacultyProfile record; provisioning creates the Firebase identity
// first, then the Neon rows in a transaction (src/lib/provisioning.ts), rolling
// back Firebase if the DB write fails. Department-scoped: Super Admin sees all;
// others only the staff their own department employs. Faculty log in with email
// (no register number).
//
// Open to Super Admin (all departments) and HOD (their own only), enforced by
// the department-scoped `where` + a scoped authorize below.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { provisionFacultyAccount } from "@/lib/provisioning";
import {
  FACULTY_INCLUDE,
  toFacultyDto,
  validateAssignableRoles,
  validateDepartment,
} from "./dto";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ParsedFaculty = {
  email: string;
  displayName: string;
  // The employing department — the anchor, and the ONLY thing that scopes a
  // staff account. There is deliberately no programId: see validateDepartment.
  departmentId: string;
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

  const departmentId = typeof b.departmentId === "string" ? b.departmentId.trim() : "";
  if (!departmentId) return { error: "Department is required." };

  // Note: any `programId` in the body is ignored outright rather than parsed —
  // staff carry no award, so there is nothing for it to mean.

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
      departmentId,
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

    // ?teachingIn=<departmentId> — "who may be timetabled in this department",
    // which is a DIFFERENT question from "who does it employ". It answers with the
    // employed staff PLUS anyone attached there this semester, so the picker offers
    // exactly the set POST /api/timetable would accept. Without this the two drift:
    // an attached lecturer is accepted by the API but never offered by the UI.
    const teachingIn = new URL(req.url).searchParams.get("teachingIn")?.trim();

    if (teachingIn) {
      // Only for a department the caller may act in — otherwise this parameter
      // would be a way around the scoping below and let any HOD enumerate another
      // department's staff.
      authorize(ctx, "manage", "Faculty", { departmentId: teachingIn });

      const semester = await db.semester.findFirst({
        where: { isActive: true },
        select: { id: true },
      });

      const faculty = await db.facultyProfile.findMany({
        relationLoadStrategy: "join",
        where: {
          OR: [
            { departmentId: teachingIn },
            // No active semester → no attachment can be current, so this arm
            // matches nothing rather than silently matching every attachment ever.
            {
              attachments: {
                some: { departmentId: teachingIn, semesterId: semester?.id ?? "__none__" },
              },
            },
          ],
        },
        // A DELIBERATELY SLIM SELECT, not FACULTY_INCLUDE. The attachment arm above
        // returns people employed by ANOTHER department — the caller has authority
        // over the host department, not over those staff — so returning the HR DTO
        // here would hand a CSE HOD an S&H lecturer's date of birth, marital status,
        // parents' names and personal phone. These five fields are exactly what the
        // two consumers map (the timetable and cover pickers); nothing more is owed.
        select: {
          userId: true,
          staffId: true,
          departmentId: true,
          department: { select: { code: true } },
          user: { select: { displayName: true, status: true } },
        },
        orderBy: { staffId: "asc" },
      });

      return Response.json(
        faculty.map((f) => ({
          userId: f.userId,
          displayName: f.user.displayName,
          departmentId: f.departmentId,
          departmentCode: f.department.code,
          status: f.user.status,
        })),
      );
    }

    // Super Admin: all faculty. Scoped roles: only their own DEPARTMENT — staff are
    // scoped by who employs them, so an S&H HOD sees S&H staff even though S&H runs
    // no award. departmentId is a column on FacultyProfile, so no `user:` nesting.
    const where = ctx.isInstitutionScoped
      ? {}
      : { departmentId: ctx.departmentId ?? "__none__" };

    const faculty = await db.facultyProfile.findMany({
      relationLoadStrategy: "join",
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

    // Can only provision into a department you're allowed to act in. Staff are
    // scoped by who EMPLOYS them, so this is the department axis — an S&H HOD adds
    // S&H staff even though S&H runs no award.
    authorize(ctx, "manage", "Faculty", { departmentId: parsed.data.departmentId });

    // Validate the chosen roles are assignable (exist, PROGRAM-scoped, not Student)
    // and don't grant more than the actor has.
    const roleCheck = await validateAssignableRoles(parsed.data.roleIds, ctx);
    if ("error" in roleCheck) return Response.json({ error: roleCheck.error }, { status: 400 });

    // Guard the employing department before any Firebase user is created — a
    // clean 400 beats a provisioning failure after the identity already exists.
    const dept = await validateDepartment(parsed.data.departmentId);
    if ("error" in dept) return Response.json({ error: dept.error }, { status: 400 });

    let result;
    try {
      result = await provisionFacultyAccount({
        email: parsed.data.email,
        displayName: parsed.data.displayName,
        departmentId: parsed.data.departmentId,
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
