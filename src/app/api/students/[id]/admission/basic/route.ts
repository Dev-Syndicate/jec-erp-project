// PUT /api/students/[id]/admission/basic — save the Basic Info step.
//
// Part of the save-per-step admission wizard. Upserts the StudentProfile (1:1)
// and updates the anchor fields on Student that this step owns (dob, gender).
// Leaves admissionStatus as DRAFT — submission is a separate final action.
//
// Authorization: Super Admin (any dept) or HOD (own dept only). The API is the
// boundary; it re-checks the student belongs to a department the caller may edit.
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Body = {
  // StudentProfile:
  fullNameSSC?: string;
  region?: string;
  alternatePhone?: string;
  seatTypeCategory?: "CONVENER" | "MANAGEMENT";
  aadhaarNumber?: string;
  nationality?: string;
  scholarshipType?: string;
  accommodation?: "DAY_SCHOLAR" | "HOSTEL";
  religionId?: string | null;
  categoryId?: string | null;
  casteId?: string | null;
  // Anchor fields this step also edits:
  dateOfBirth?: string;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
};

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const { id } = await params;
    const student = await db.student.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!student) return Response.json({ error: "Student not found." }, { status: 404 });
    // HOD may only touch students in their own department.
    assertDeptScope(ctx, student.user.departmentId);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });

    // Required to save this step (per-step validation — the DB columns are
    // nullable because the row may be created before this step is filled).
    if (!body.fullNameSSC?.trim()) {
      return Response.json({ error: "Full name (as per SSC) is required." }, { status: 400 });
    }
    if (!body.seatTypeCategory) {
      return Response.json({ error: "Seat type is required." }, { status: 400 });
    }
    if (!body.accommodation) {
      return Response.json({ error: "Accommodation is required." }, { status: 400 });
    }

    const profileData = {
      fullNameSSC: body.fullNameSSC.trim(),
      region: body.region?.trim() || null,
      alternatePhone: body.alternatePhone?.trim() || null,
      seatTypeCategory: body.seatTypeCategory,
      aadhaarNumber: body.aadhaarNumber?.trim() || null,
      nationality: body.nationality?.trim() || null,
      scholarshipType: body.scholarshipType?.trim() || null,
      accommodation: body.accommodation,
      religionId: body.religionId || null,
      categoryId: body.categoryId || null,
      casteId: body.casteId || null,
    };

    // Profile upsert + anchor update in one transaction.
    await db.$transaction(async (tx) => {
      await tx.studentProfile.upsert({
        where: { studentId: id },
        update: profileData,
        create: { studentId: id, ...profileData },
      });
      const anchor: { dateOfBirth?: Date; gender?: "MALE" | "FEMALE" | "OTHER" | null } = {};
      if (body.dateOfBirth) anchor.dateOfBirth = new Date(body.dateOfBirth);
      if (body.gender !== undefined) anchor.gender = body.gender;
      if (Object.keys(anchor).length) {
        await tx.student.update({ where: { id }, data: anchor });
      }
    });

    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
