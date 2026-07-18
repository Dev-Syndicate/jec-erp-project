// POST /api/students/import/[batchId]/regenerate — re-issue temp passwords for a
// batch whose results file was lost.
//
// Regenerates ONLY for members who are still on their temp password
// (mustChangePassword=true — never logged in). Members who already set their own
// password are skipped so we never clobber it. Error/skipped members (no student
// created) are ignored. Returns a fresh results set to re-download.
//
// Authorization: Super Admin (any dept) or HOD (own dept only). See
// docs/bulk-student-import.md §05-B.
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { regenerateTempPassword } from "@/lib/provisioning";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const { batchId } = await params;
    const batch = await db.importBatch.findUnique({
      where: { id: batchId },
      include: {
        department: true,
        members: {
          include: {
            student: {
              include: {
                user: { select: { id: true, firebaseUid: true, email: true, displayName: true, mustChangePassword: true } },
              },
            },
          },
        },
      },
    });
    if (!batch) return Response.json({ error: "Import batch not found." }, { status: 404 });
    assertDeptScope(ctx, batch.departmentId);

    const results: Array<{
      registerNumber: string;
      name: string;
      email: string;
      status: "regenerated" | "skipped";
      reason?: string;
      tempPassword?: string;
    }> = [];

    for (const member of batch.members) {
      const student = member.student;
      const user = student?.user;
      // Rows that never created a student (error/skipped at import) have nothing
      // to regenerate.
      if (!student || !user) {
        results.push({
          registerNumber: member.registerNumber,
          name: "",
          email: "",
          status: "skipped",
          reason: "No account was created for this row.",
        });
        continue;
      }
      // Already using the account — must not reset.
      if (!user.mustChangePassword) {
        results.push({
          registerNumber: member.registerNumber,
          name: user.displayName,
          email: user.email,
          status: "skipped",
          reason: "Student already set their own password.",
        });
        continue;
      }

      const tempPassword = await regenerateTempPassword({ id: user.id, firebaseUid: user.firebaseUid });
      results.push({
        registerNumber: member.registerNumber,
        name: user.displayName,
        email: user.email,
        status: "regenerated",
        tempPassword,
      });
    }

    const regeneratedCount = results.filter((r) => r.status === "regenerated").length;

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: "student.batchRegeneratePassword",
        entity: "ImportBatch",
        entityId: batch.id,
        after: { regeneratedCount, skipped: results.length - regeneratedCount },
      },
    });

    return Response.json({
      batchId: batch.id,
      department: { id: batch.department.id, name: batch.department.name, code: batch.department.code },
      regeneratedCount,
      skippedCount: results.length - regeneratedCount,
      results: results.sort((a, b) => a.registerNumber.localeCompare(b.registerNumber)),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
