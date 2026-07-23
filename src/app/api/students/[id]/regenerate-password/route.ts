// POST /api/students/[id]/regenerate-password — reissue a one-time temp password
// for a student who hasn't logged in yet (results file lost, etc.). Returns the
// new password, revealed once.
//
// Authorized by the SAME roster-ownership rule as the class teacher's edits: the
// student's active-class advisor may reissue it, and so may a `manage Student`
// holder (HOD/Super Admin) in the student's program. (A plain subject teacher
// cannot.) The advisor delivering a fresh temp password to a student in their own
// class is part of the class-teacher job, not an admin-only action.
//
// Only valid while the student is still on their temp password (mustChangePassword
// = true). Once they've set their own, regenerating is refused — that's a proper
// account-recovery flow, not this convenience (matches provisioning.ts).
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { regenerateTempPassword } from "@/lib/provisioning";
import { assertManagesRoster } from "@/app/api/roster/access";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    const { id } = await params;

    const student = await db.student.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firebaseUid: true, programId: true, mustChangePassword: true } },
        // The student's CURRENT class decides who may reissue — its advisor, or a
        // manage-Student admin in the program (assertManagesRoster).
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
      // Not in a class this year — only an admin (manage Student, program-scoped) can.
      authorize(ctx, "manage", "Student", { programId: student.user.programId });
    }

    if (!student.user.mustChangePassword) {
      return Response.json(
        { error: "This student has already set their own password, so a temp can't be reissued." },
        { status: 409 },
      );
    }

    const tempPassword = await regenerateTempPassword({
      id: student.user.id,
      firebaseUid: student.user.firebaseUid,
    });

    return Response.json({ tempPassword });
  } catch (err) {
    return toAuthResponse(err);
  }
}
