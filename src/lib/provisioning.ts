// Shared onboarding helpers — generate the temporary password used when an admin
// provisions an account, and the create-one-student routine that both the single
// provision route and the bulk importer share. The user is given this password
// (results file / email) and forced to reset it on first login
// (mustChangePassword); the admin never sets or keeps the real one (CLAUDE.md
// onboarding rule).
import "server-only";

import { randomBytes } from "node:crypto";

import { createFirebaseUser, deleteFirebaseUser, resetFirebasePassword } from "@/lib/firebase-admin";
import { db } from "@/lib/db";

// A readable-ish temporary password with enough entropy to be safe as a
// one-time credential. Mixed case + digits so it satisfies common Firebase /
// policy minimums. Not meant to be memorised — it's replaced on first login.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generateTempPassword(length = 14): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

// The anchor fields needed to create one student account.
export type StudentAnchor = {
  email: string;
  displayName: string;
  programId: string;
  roleId: string; // the seeded "Student" Role id
  registerNumber: string; // login handle — required
  rollNumber?: string | null; // college-given — optional
  dateOfBirth: string; // ISO yyyy-mm-dd
  phone: string;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  // Optional: place the student in a class for an academic year in the SAME
  // transaction, so a newly-added student is enrolled immediately (no separate
  // step, no "Not enrolled" limbo). The caller validates the class + active year.
  enrollment?: { classId: string; academicYearId: string };
};

export type ProvisionedStudent = {
  userId: string;
  studentId: string;
  tempPassword: string;
};

/**
 * Create one student account: Firebase identity first, then the linked Neon
 * User + Student in a transaction. If the Neon write fails, the Firebase user is
 * deleted so the operation is all-or-nothing and a retry won't collide on the
 * email. Returns the ids + the one-time temp password. Throws on failure (the
 * caller decides how to report it — a single 4xx, or a per-row result in bulk).
 */
export async function provisionStudentAccount(anchor: StudentAnchor): Promise<ProvisionedStudent> {
  const tempPassword = generateTempPassword();
  const firebaseUid = await createFirebaseUser({
    email: anchor.email,
    password: tempPassword,
    displayName: anchor.displayName,
  });

  try {
    const user = await db.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          firebaseUid,
          email: anchor.email,
          displayName: anchor.displayName,
          programId: anchor.programId,
          mustChangePassword: true,
          roles: { create: { roleId: anchor.roleId } },
          student: {
            create: {
              registerNumber: anchor.registerNumber,
              rollNumber: anchor.rollNumber?.trim() || null,
              dateOfBirth: new Date(anchor.dateOfBirth),
              phone: anchor.phone,
              gender: anchor.gender ?? null,
              ...(anchor.enrollment
                ? {
                    enrollments: {
                      create: {
                        classId: anchor.enrollment.classId,
                        academicYearId: anchor.enrollment.academicYearId,
                      },
                    },
                  }
                : {}),
            },
          },
        },
        include: { student: true },
      });
    });
    return { userId: user.id, studentId: user.student!.id, tempPassword };
  } catch (e) {
    // Undo the Firebase user so a retry doesn't collide on the email.
    await deleteFirebaseUser(firebaseUid).catch((cleanupErr) =>
      console.error("Failed to roll back Firebase user after Neon error:", cleanupErr),
    );
    throw e;
  }
}

// The anchor fields needed to create one faculty account. Faculty log in with
// their email (not a register number); their profile is HR detail, not a Student.
export type FacultyAnchor = {
  email: string;
  displayName: string;
  programId: string;
  roleIds: string[]; // one or more assignable Role ids (validated by the caller)
  staffId: string; // college-assigned id — required, unique
  designation: string; // HR title, e.g. "Asst. Professor"
  phone: string;
  emergencyPhone?: string | null;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth?: string | null; // ISO yyyy-mm-dd or null
  maritalStatus?: "SINGLE" | "MARRIED" | "OTHER" | null;
  fatherName?: string | null;
  motherName?: string | null;
};

export type ProvisionedFaculty = {
  userId: string;
  facultyProfileId: string;
  tempPassword: string;
};

/**
 * Create one faculty account: Firebase identity first, then the linked Neon User
 * + FacultyProfile in a transaction. If the Neon write fails, the Firebase user
 * is deleted so the operation is all-or-nothing and a retry won't collide on the
 * email. Same shape as provisionStudentAccount — returns the ids + one-time temp
 * password. Throws on failure (the caller maps it to a response).
 */
export async function provisionFacultyAccount(anchor: FacultyAnchor): Promise<ProvisionedFaculty> {
  const tempPassword = generateTempPassword();
  const firebaseUid = await createFirebaseUser({
    email: anchor.email,
    password: tempPassword,
    displayName: anchor.displayName,
  });

  try {
    const user = await db.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          firebaseUid,
          email: anchor.email,
          displayName: anchor.displayName,
          programId: anchor.programId,
          mustChangePassword: true,
          roles: { create: anchor.roleIds.map((roleId) => ({ roleId })) },
          facultyProfile: {
            create: {
              staffId: anchor.staffId,
              designation: anchor.designation,
              phone: anchor.phone,
              emergencyPhone: anchor.emergencyPhone?.trim() || null,
              gender: anchor.gender ?? null,
              dateOfBirth: anchor.dateOfBirth ? new Date(anchor.dateOfBirth) : null,
              maritalStatus: anchor.maritalStatus ?? null,
              fatherName: anchor.fatherName?.trim() || null,
              motherName: anchor.motherName?.trim() || null,
            },
          },
        },
        include: { facultyProfile: true },
      });
    });
    return { userId: user.id, facultyProfileId: user.facultyProfile!.id, tempPassword };
  } catch (e) {
    // Undo the Firebase user so a retry doesn't collide on the email.
    await deleteFirebaseUser(firebaseUid).catch((cleanupErr) =>
      console.error("Failed to roll back Firebase user after Neon error:", cleanupErr),
    );
    throw e;
  }
}

/**
 * Regenerate a user's temporary password: reset Firebase to a fresh temp and
 * re-arm mustChangePassword so first login forces a reset again. Returns the new
 * password (revealed once, never stored).
 *
 * SAFETY: callers must only invoke this for accounts still on their temp
 * password (mustChangePassword=true) — resetting an account whose owner has set
 * their own password would lock them out. The batch path filters on that flag;
 * the single-student path re-checks it before calling.
 */
export async function regenerateTempPassword(user: {
  id: string;
  firebaseUid: string;
}): Promise<string> {
  const tempPassword = generateTempPassword();
  await resetFirebasePassword(user.firebaseUid, tempPassword);
  await db.user.update({
    where: { id: user.id },
    data: { mustChangePassword: true },
  });
  return tempPassword;
}
