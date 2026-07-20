// /api/students/[id] — edit a student's detail fields + lifecycle status.
// Super-Admin only (program-scoped). params is a Promise in Next 16 — await it.
//
// registerNumber (login handle) and email (Firebase identity) are NOT editable
// here — changing them has identity consequences handled elsewhere. Setting a
// non-ACTIVE status also disables the login (User.status = INACTIVE) so a
// graduated/dropped student can't sign in; reactivating restores it. The auth
// cache is busted so it takes effect immediately rather than after the TTL.
import { authenticate, assertProgramScope, invalidateAuthUser, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { STUDENT_INCLUDE, toStudentDto } from "../dto";

export const dynamic = "force-dynamic";

type StudentPatch = {
  displayName?: string;
  rollNumber?: string | null;
  phone?: string;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth?: string;
  status?: "ACTIVE" | "GRADUATED" | "DROPPED" | "TRANSFERRED";
};

function parsePatchBody(body: unknown): { data: StudentPatch } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing request body." };
  const b = body as Record<string, unknown>;
  const data: StudentPatch = {};

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
  if (b.status !== undefined) {
    if (!["ACTIVE", "GRADUATED", "DROPPED", "TRANSFERRED"].includes(b.status as string)) {
      return { error: "Invalid status." };
    }
    data.status = b.status as StudentPatch["status"];
  }

  if (Object.keys(data).length === 0) return { error: "Nothing to update." };
  return { data };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const parsed = parsePatchBody(body);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    const existing = await db.student.findUnique({
      where: { id },
      include: { user: { select: { id: true, firebaseUid: true, programId: true } } },
    });
    if (!existing) return Response.json({ error: "Student not found." }, { status: 404 });
    assertProgramScope(ctx, existing.user.programId);

    const { status, ...studentFields } = parsed.data;
    // A non-ACTIVE lifecycle status also disables the login; ACTIVE restores it.
    const userStatusUpdate =
      status === undefined ? undefined : status === "ACTIVE" ? "ACTIVE" : "INACTIVE";

    // Keep the login flag and the student status consistent (atomic), then map.
    const updated = await db.$transaction(async (tx) => {
      if (userStatusUpdate) {
        await tx.user.update({
          where: { id: existing.user.id },
          data: { status: userStatusUpdate },
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

    // Reflect a login enable/disable immediately instead of waiting out the TTL.
    if (userStatusUpdate) invalidateAuthUser(existing.user.firebaseUid);

    return Response.json(toStudentDto(updated));
  } catch (err) {
    return toAuthResponse(err);
  }
}
