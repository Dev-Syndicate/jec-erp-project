// /api/students/[id] — edit a student's detail fields + lifecycle status.
// Super-Admin only (program-scoped). params is a Promise in Next 16 — await it.
//
// registerNumber (the login handle) and email (the Firebase identity) ARE
// editable here — deliberately, and only here: /api/roster still refuses them so
// a class advisor can't alter what a student signs in with.
//
// Both are login handles, so each has a failure mode worth knowing:
//   - registerNumber is Neon-only. Login resolves it fresh every time
//     (/api/auth/resolve-roll), so the student simply uses the new number next
//     sign-in. Unique — a clash is a 409, not a 500.
//   - email lives in BOTH systems. Firebase authenticates on it; Neon stores a
//     copy that resolve-roll hands to the client. If the two ever diverge, login
//     breaks silently. So the Firebase write happens AFTER the Neon transaction
//     commits, and a Firebase failure rolls the Neon email back.
//
// Setting a non-ACTIVE status also disables the login (User.status = INACTIVE) so
// a graduated/dropped student can't sign in; reactivating restores it. The auth
// cache is busted so it takes effect immediately rather than after the TTL.
import { authenticate, invalidateAuthUser, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateFirebaseEmail } from "@/lib/firebase-admin";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { STUDENT_INCLUDE, toStudentDto } from "../dto";

export const dynamic = "force-dynamic";

type StudentPatch = {
  displayName?: string;
  registerNumber?: string;
  email?: string;
  rollNumber?: string | null;
  phone?: string;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth?: string;
  status?: "ACTIVE" | "GRADUATED" | "DROPPED" | "TRANSFERRED";
  classId?: string; // move the student to this class for the active year
};

// Exported for unit tests — pure, no DB. The identity rules it enforces (a login
// handle may never be blanked; email shape matches the bulk importer) are the
// part worth pinning; see test/api/student-patch.test.ts.
export function parsePatchBody(body: unknown): { data: StudentPatch } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;
  const data: StudentPatch = {};

  if (b.displayName !== undefined) {
    const v = typeof b.displayName === "string" ? b.displayName.trim() : "";
    if (!v) return { error: "Name can't be empty." };
    data.displayName = v;
  }
  // Identity fields. Both are login handles, so neither may be blanked — an
  // empty register number would strand the student's sign-in entirely.
  if (b.registerNumber !== undefined) {
    const v = typeof b.registerNumber === "string" ? b.registerNumber.trim() : "";
    if (!v) return { error: "Register number can't be empty." };
    data.registerNumber = v;
  }
  if (b.email !== undefined) {
    // Same shape check as the bulk importer (src/lib/student-import.ts), so the
    // two entry points agree on what a valid address looks like. Lower-cased:
    // Firebase treats emails case-insensitively and resolve-roll compares them.
    const v = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!v) return { error: "Email can't be empty." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { error: `Invalid email: ${v}` };
    data.email = v;
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
  if (b.status !== undefined) {
    if (!["ACTIVE", "GRADUATED", "DROPPED", "TRANSFERRED"].includes(b.status as string)) {
      return { error: "Invalid status." };
    }
    data.status = b.status as StudentPatch["status"];
  }
  // Only acts when non-empty — the class is edited alongside the other details.
  if (b.classId !== undefined && typeof b.classId === "string" && b.classId.trim() !== "") {
    data.classId = b.classId.trim();
  }

  if (Object.keys(data).length === 0) return { error: "Nothing to update." };
  return { data };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Student");
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const parsed = parsePatchBody(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    const existing = await db.student.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firebaseUid: true, programId: true, email: true } },
        // The current class decides who may edit them — a student's department is
        // derived from it, never stored.
        enrollments: {
          where: { academicYear: { isActive: true } },
          select: { class: { select: { departmentId: true, advisorId: true } } },
          take: 1,
        },
      },
    });
    if (!existing) return Response.json({ error: "Student not found." }, { status: 404 });

    const currentClass = existing.enrollments[0]?.class;
    if (currentClass) {
      // Scoped to the department that OWNS their class: a first-year in an
      // S&H-owned class is S&H's to edit, not the branch HOD's.
      authorize(ctx, "manage", "Student", { departmentId: currentClass.departmentId });
    } else if (!ctx.isInstitutionScoped) {
      // No class this year — nothing departmental to scope against.
      return Response.json({ error: "This student isn't in a class this year." }, { status: 403 });
    }

    // displayName and email live on User, not Student — pull them out here or
    // they'd be spread into the student update as unknown columns and throw.
    const { status, classId, displayName, email, ...studentFields } = parsed.data;
    // Only a real change is worth a Firebase round-trip (and a rollback risk).
    const emailChanged = email !== undefined && email !== existing.user.email;
    // A non-ACTIVE lifecycle status also disables the login; ACTIVE restores it.
    const userStatusUpdate =
      status === undefined ? undefined : status === "ACTIVE" ? "ACTIVE" : "INACTIVE";

    // If the class changed, it must be in the student's program; the enrollment
    // moves to it for the active academic year. Validate up front for clean 400s.
    let enrollTarget: { classId: string; academicYearId: string } | undefined;
    if (classId) {
      const klass = await db.class.findUnique({ where: { id: classId }, select: { programId: true } });
      if (!klass || klass.programId !== existing.user.programId) {
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
      enrollTarget = { classId, academicYearId: activeYear.id };
    }

    // Keep the login flag, student status and enrollment consistent (atomic). The
    // student.update runs last so the returned row reflects the moved enrollment.
    let updated;
    try {
      updated = await db.$transaction(async (tx) => {
        if (userStatusUpdate || displayName !== undefined || email !== undefined) {
          await tx.user.update({
            where: { id: existing.user.id },
            data: {
              ...(userStatusUpdate ? { status: userStatusUpdate } : {}),
              ...(displayName !== undefined ? { displayName } : {}),
              ...(email !== undefined ? { email } : {}),
            },
          });
        }
        if (enrollTarget) {
          await tx.enrollment.upsert({
            where: {
              studentId_academicYearId: { studentId: id, academicYearId: enrollTarget.academicYearId },
            },
            update: { classId: enrollTarget.classId },
            create: { studentId: id, classId: enrollTarget.classId, academicYearId: enrollTarget.academicYearId },
          });
        }
        return tx.student.update({
          where: { id },
          data: {
            ...studentFields,
            ...(studentFields.dateOfBirth ? { dateOfBirth: new Date(studentFields.dateOfBirth) } : {}),
            ...(status ? { status } : {}),
          },
          include: STUDENT_INCLUDE,
        });
      });
    } catch (e) {
      // registerNumber, rollNumber and email are all @unique. Report the clash
      // as a clean 409 rather than leaking a 500 — the admin needs to know WHICH
      // handle is taken, since all three are visible in the same dialog.
      if (isUniqueViolation(e)) {
        const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? "");
        const field = target.includes("registerNumber")
          ? "That register number is already in use."
          : target.includes("email")
            ? "That email is already in use."
            : target.includes("rollNumber")
              ? "That roll number is already in use."
              : "Register number, roll number or email is already in use.";
        return Response.json({ error: field }, { status: 409 });
      }
      throw e;
    }

    // Firebase is updated only AFTER Neon commits, because it is the side we
    // cannot roll back transactionally. If it rejects the address (most often
    // auth/email-already-exists — Firebase holds identities Neon may not, e.g. a
    // deactivated account), put the Neon email back so the two never diverge:
    // a mismatch would break sign-in silently via resolve-roll.
    if (emailChanged) {
      try {
        await updateFirebaseEmail(existing.user.firebaseUid, email!);
      } catch (e) {
        await db.user.update({
          where: { id: existing.user.id },
          data: { email: existing.user.email },
        });
        invalidateAuthUser(existing.user.firebaseUid);
        const code = (e as { code?: string }).code ?? "";
        return Response.json(
          {
            error:
              code === "auth/email-already-exists"
                ? "That email is already registered to another account. The student's email was left unchanged."
                : "Couldn't update the sign-in email. The student's email was left unchanged.",
          },
          { status: 409 },
        );
      }
    }

    // Reflect a login enable/disable or an identity change immediately instead of
    // waiting out the 30s auth cache TTL.
    if (userStatusUpdate || emailChanged) invalidateAuthUser(existing.user.firebaseUid);

    return Response.json(toStudentDto(updated));
  } catch (err) {
    return toAuthResponse(err);
  }
}
