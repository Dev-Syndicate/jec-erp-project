// PUT /api/faculty/[id]/profile — save a staff member's faculty profile.
//
// Upserts the FacultyProfile (1:1 with User). Required to save: designation,
// staffId, phone. Everything else is optional. staffId is unique across faculty.
//
// Authorization: Super Admin (any dept) or HOD (own dept only). The API is the
// boundary; it re-checks the staff member belongs to a department the caller may
// edit, and that the target is staff (not a student).
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Body = {
  designation?: string;
  staffId?: string;
  phone?: string;
  emergencyPhone?: string;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth?: string;
  maritalStatus?: "SINGLE" | "MARRIED" | "OTHER" | null;
  fatherName?: string;
  motherName?: string;
};

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const { id } = await params;
    const user = await db.user.findUnique({
      where: { id },
      include: { student: { select: { id: true } } },
    });
    if (!user || user.student) {
      return Response.json({ error: "Faculty member not found." }, { status: 404 });
    }
    assertDeptScope(ctx, user.departmentId);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });

    // Required to save this profile (per-form validation; DB columns for the
    // rest are nullable because the row may not exist until first save).
    if (!body.designation?.trim()) {
      return Response.json({ error: "Designation is required." }, { status: 400 });
    }
    if (!body.staffId?.trim()) {
      return Response.json({ error: "Staff ID is required." }, { status: 400 });
    }
    if (!body.phone?.trim()) {
      return Response.json({ error: "Phone is required." }, { status: 400 });
    }

    const data = {
      designation: body.designation.trim(),
      staffId: body.staffId.trim(),
      phone: body.phone.trim(),
      emergencyPhone: body.emergencyPhone?.trim() || null,
      gender: body.gender ?? null,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
      maritalStatus: body.maritalStatus ?? null,
      fatherName: body.fatherName?.trim() || null,
      motherName: body.motherName?.trim() || null,
    };

    try {
      await db.facultyProfile.upsert({
        where: { userId: id },
        update: data,
        create: { userId: id, ...data },
      });
    } catch (e) {
      // Most likely a duplicate staffId (unique).
      const msg = e instanceof Error ? e.message : "";
      if (/unique|constraint|already exists/i.test(msg)) {
        return Response.json({ error: "That Staff ID is already in use." }, { status: 409 });
      }
      throw e;
    }

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: "faculty.profileSaved",
        entity: "FacultyProfile",
        entityId: id,
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
