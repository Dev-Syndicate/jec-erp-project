// GET /api/profile — the signed-in user's own full profile detail.
//
// Distinct from /api/auth/me (the lightweight "who am I" the shell polls): this
// is the richer self-view the Profile page renders — program name, and the
// role-specific record (faculty HR fields OR student register detail). It's
// always self-scoped (the user's own row), so authenticate() is the only gate;
// no authorize() capability check is needed to read your own account.
import { authenticate, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { user, roles } = await authenticate(req);

    const full = await db.user.findUnique({
      where: { id: user.id },
      include: {
        program: { include: { degree: true, branch: true } },
        facultyProfile: true,
        student: true,
      },
    });
    if (!full) return toAuthResponse(new Error("Profile not found."));

    return Response.json({
      id: full.id,
      email: full.email,
      displayName: full.displayName,
      status: full.status,
      roles,
      program: full.program
        ? {
            degreeCode: full.program.degree.code,
            degreeName: full.program.degree.name,
            branchCode: full.program.branch.code,
            branchName: full.program.branch.name,
          }
        : null,
      faculty: full.facultyProfile
        ? {
            staffId: full.facultyProfile.staffId,
            designation: full.facultyProfile.designation,
            phone: full.facultyProfile.phone,
            emergencyPhone: full.facultyProfile.emergencyPhone,
            gender: full.facultyProfile.gender,
            dateOfBirth: full.facultyProfile.dateOfBirth?.toISOString() ?? null,
            maritalStatus: full.facultyProfile.maritalStatus,
            fatherName: full.facultyProfile.fatherName,
            motherName: full.facultyProfile.motherName,
          }
        : null,
      student: full.student
        ? {
            registerNumber: full.student.registerNumber,
            rollNumber: full.student.rollNumber,
            dateOfBirth: full.student.dateOfBirth.toISOString(),
            phone: full.student.phone,
            gender: full.student.gender,
          }
        : null,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
