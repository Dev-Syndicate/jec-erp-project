// GET /api/me/staff-overview?date=YYYY-MM-DD — the signed-in STAFF member's live
// dashboard: their classes today (from the timetable for that date's weekday),
// whether they advise a class, and — for an admin (manage Student) — a scoped
// snapshot of students / faculty / classes. Everything is derived from real data,
// so the Overview shows actual work instead of static placeholders.
//
// The date is the caller's local "today" (avoids server-timezone drift); the
// weekday decides today's schedule (Sat/Sun → no classes).
import { authenticate, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayName, parseDateOnly } from "@/app/api/attendance/dto";

export const dynamic = "force-dynamic";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;
type Weekday = (typeof WEEKDAYS)[number];

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);

    const dateStr = new URL(req.url).searchParams.get("date")?.trim() || "";
    const date = parseDateOnly(dateStr);
    const dn = date ? dayName(date) : null;
    const weekday = dn && (WEEKDAYS as readonly string[]).includes(dn) ? (dn as Weekday) : null;

    const semester = await db.semester.findFirst({
      where: { isActive: true },
      include: { academicYear: { select: { name: true } } },
    });
    const semesterLabel = semester
      ? `${semester.academicYear.name} · ${semester.kind === "ODD" ? "Odd" : "Even"}`
      : null;

    // Today's classes for this faculty (their scheduled periods on this weekday).
    let todayClasses: Array<{
      period: number;
      subjectCode: string;
      subjectName: string;
      classId: string;
      classShort: string;
    }> = [];
    if (semester && weekday) {
      const slots = await db.timetableSlot.findMany({
        where: { facultyId: ctx.user.id, semesterId: semester.id, dayOfWeek: weekday },
        include: {
          subject: { select: { code: true, name: true } },
          class: { select: { year: true, section: true } },
        },
        orderBy: { period: "asc" },
      });
      todayClasses = slots.map((s) => ({
        period: s.period,
        subjectCode: s.subject.code,
        subjectName: s.subject.name,
        classId: s.classId,
        classShort: `${roman(s.class.year)}-${s.class.section}`,
      }));
    }

    const advisedCount = await db.class.count({
      where: { advisorId: ctx.user.id, isActive: true },
    });

    // Does this user teach at all this semester? (Gates the "My timetable" link —
    // Super Admin / non-teaching staff have no personal timetable.)
    const teaches = semester
      ? (await db.timetableSlot.count({
          where: { facultyId: ctx.user.id, semesterId: semester.id },
        })) > 0
      : false;

    // Admin snapshot (only for a manage-Student holder), scoped to their program
    // unless they're institution-scoped (Super Admin).
    let stats: { students: number; faculty: number; classes: number } | null = null;
    if (ctx.ability.can("manage", "Student")) {
      const programWhere = ctx.isInstitutionScoped
        ? {}
        : { programId: ctx.user.programId ?? "__none__" };
      const userProgramWhere = ctx.isInstitutionScoped
        ? {}
        : { user: { programId: ctx.user.programId ?? "__none__" } };
      const [students, faculty, classes] = await Promise.all([
        db.student.count({ where: userProgramWhere }),
        db.facultyProfile.count({ where: userProgramWhere }),
        db.class.count({ where: programWhere }),
      ]);
      stats = { students, faculty, classes };
    }

    return Response.json({
      date: dateStr || null,
      weekend: date !== null && weekday === null,
      semesterLabel,
      todayClasses,
      advisesClass: advisedCount > 0,
      teaches,
      stats,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
