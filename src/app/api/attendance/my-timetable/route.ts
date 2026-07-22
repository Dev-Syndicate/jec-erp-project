// GET /api/attendance/my-timetable — the signed-in staff member's own weekly
// teaching schedule for the ACTIVE semester (the periods they're the assigned
// faculty for, across every class). Self-scoped: it only ever returns the
// caller's own slots (facultyId = ctx.user.id), gated on the attendance-marking
// capability so it's staff-only. Powers the "My timetable" screen.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { roman } from "../dto";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "mark", "Attendance"); // attendance-marking staff (SA/HOD/Faculty)

    const semester = await db.semester.findFirst({
      where: { isActive: true },
      include: { academicYear: { select: { name: true } } },
    });
    if (!semester) return Response.json({ semesterLabel: null, slots: [] });

    const slots = await db.timetableSlot.findMany({
      where: { facultyId: ctx.user.id, semesterId: semester.id },
      include: {
        subject: { select: { code: true, name: true } },
        class: { include: { program: { include: { degree: true, branch: true } } } },
      },
      orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
    });

    return Response.json({
      semesterLabel: `${semester.academicYear.name} · ${semester.kind === "ODD" ? "Odd" : "Even"}`,
      slots: slots.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        period: s.period,
        subjectCode: s.subject.code,
        subjectName: s.subject.name,
        classId: s.classId,
        classLabel: `${s.class.program.degree.code} · ${s.class.program.branch.code} · ${roman(s.class.year)}-${s.class.section}`,
        classShort: `${roman(s.class.year)}-${s.class.section}`,
      })),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
