// GET /api/attendance/classes — the classes the caller can work with for
// attendance, for the pickers on the marking / day / report screens.
//
// This is NARROWER than /api/classes: a `manage Attendance` holder (HOD/Super
// Admin) gets every class in program scope, but a plain `mark Attendance` holder
// (Faculty) gets only the classes they teach (a timetable slot this semester) or
// advise. The per-request API checks still apply on the specific class, but this
// keeps the dropdown from offering classes the faculty would only 403 on.
//
// `?scope=day` narrows a Faculty further to classes they ADVISE (are class teacher
// of) — the Day-attendance correction screen, which even a class's subject
// teachers can't touch unless they advise it. HOD/SA are unaffected (manage).
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { CLASS_INCLUDE, toClassDto } from "../../classes/dto";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "mark", "Attendance");

    const dayScope = new URL(req.url).searchParams.get("scope") === "day";

    let where;
    if (ctx.ability.can("manage", "Attendance")) {
      // HOD/SA: every class in program scope (SA is unscoped).
      where = ctx.isInstitutionScoped ? {} : { programId: ctx.user.programId ?? "__none__" };
    } else if (dayScope) {
      // Faculty, day-record correction: only classes they advise (class teacher).
      where = { programId: ctx.user.programId ?? "__none__", advisorId: ctx.user.id };
    } else {
      // Faculty, marking: classes they teach this active semester, or advise.
      const semester = await db.semester.findFirst({ where: { isActive: true }, select: { id: true } });
      const taught = semester
        ? await db.timetableSlot.findMany({
            where: { facultyId: ctx.user.id, semesterId: semester.id },
            select: { classId: true },
            distinct: ["classId"],
          })
        : [];
      where = {
        programId: ctx.user.programId ?? "__none__",
        OR: [{ id: { in: taught.map((t) => t.classId) } }, { advisorId: ctx.user.id }],
      };
    }

    const classes = await db.class.findMany({
      where,
      include: CLASS_INCLUDE,
      orderBy: [{ isActive: "desc" }, { year: "asc" }, { section: "asc" }],
    });
    return Response.json(classes.map(toClassDto));
  } catch (err) {
    return toAuthResponse(err);
  }
}
