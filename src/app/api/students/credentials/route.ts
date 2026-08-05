// POST /api/students/credentials — reissue temp passwords in bulk, grouped by
// class, so an admin can print and hand out login slips.
//
// WHY THIS RESETS RATHER THAN READS
//
// It cannot return the passwords that were originally issued: Firebase stores
// only hashes and no Neon column keeps a copy (src/lib/provisioning.ts). So this
// GENERATES a fresh temp password per student and returns it once. Any slip
// printed earlier stops working — that is the point, not a side effect.
//
// SAFE BY CONSTRUCTION: it acts ONLY on students still on their temp password
// (mustChangePassword = true — the "Invited" state in the UI). Someone who has
// set their own password is never touched, so this can't lock anybody out. That
// is the same rule regenerateTempPassword documents for the single-student path.
//
// WHO: `manage Student` scoped to the department that OWNS the class, so a HOD
// covers their own department and Super Admin covers everything. Deliberately
// per class rather than institution-wide: the response carries live credentials,
// and the caller must have authority over each class it touches.
//
// Auth is the CLAUDE.md two-step: authenticate() (who) then authorize() (may).
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { regenerateTempPassword } from "@/lib/provisioning";

export const dynamic = "force-dynamic";

// Cap one request so a mis-click can't reset a whole college in one go and
// generate more Firebase writes than a serverless invocation can finish.
const MAX_PER_REQUEST = 600;

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Student");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    // Optional: restrict to specific classes. Omitted means "every class the
    // caller may act in", which is the whole-cohort handover.
    const classIds = Array.isArray(body?.classIds)
      ? [...new Set(body.classIds.filter((v): v is string => typeof v === "string" && v.trim() !== ""))]
      : null;

    // Which classes are in play. Scoped on the OWNING department: a first-year
    // class belongs to S&H even though its award is B.E-CSE.
    const classes = await db.class.findMany({
      where: {
        ...(classIds ? { id: { in: classIds } } : {}),
        ...(ctx.isInstitutionScoped ? {} : { departmentId: ctx.departmentId ?? "__none__" }),
      },
      select: {
        id: true, year: true, section: true, departmentId: true,
        program: { select: { degree: { select: { code: true } }, branch: { select: { code: true } } } },
      },
      orderBy: [{ year: "asc" }, { section: "asc" }],
    });

    // Re-check each class individually. The `where` above already filters, but a
    // caller who NAMED class ids must be authorized for each one — otherwise a
    // scoped role could ask for another department's class and have the filter
    // silently drop it, which reads as "no students" rather than "not allowed".
    for (const k of classes) {
      authorize(ctx, "manage", "Student", { departmentId: k.departmentId });
    }
    if (classes.length === 0) {
      return Response.json({ error: "No classes you can act on." }, { status: 400 });
    }

    // Only students who are ACTIVE, enrolled this year, and STILL ON THEIR TEMP
    // PASSWORD. The last condition is what makes this safe to run repeatedly.
    const students = await db.student.findMany({
      where: {
        status: "ACTIVE",
        user: { status: "ACTIVE", mustChangePassword: true },
        enrollments: { some: { academicYear: { isActive: true }, classId: { in: classes.map((c) => c.id) } } },
      },
      select: {
        registerNumber: true,
        rollNumber: true,
        user: { select: { id: true, firebaseUid: true, displayName: true, email: true } },
        enrollments: {
          where: { academicYear: { isActive: true } },
          select: { classId: true },
          take: 1,
        },
      },
      orderBy: { registerNumber: "asc" },
    });

    if (students.length > MAX_PER_REQUEST) {
      return Response.json(
        { error: `That's ${students.length} students. Select fewer classes — at most ${MAX_PER_REQUEST} at a time.` },
        { status: 400 },
      );
    }

    const byClass = new Map(classes.map((c) => [c.id, c]));
    const groups = new Map<string, { classLabel: string; fileLabel: string; rows: Array<Record<string, string>> }>();
    const failed: Array<{ registerNumber: string; reason: string }> = [];

    for (const s of students) {
      const classId = s.enrollments[0]?.classId;
      const k = classId ? byClass.get(classId) : undefined;
      if (!k) continue;

      let password: string;
      try {
        password = await regenerateTempPassword({ id: s.user.id, firebaseUid: s.user.firebaseUid });
      } catch (e) {
        // One Firebase failure must not cost the rest of the class their slips.
        failed.push({ registerNumber: s.registerNumber, reason: e instanceof Error ? e.message : "Failed to reset." });
        continue;
      }

      const label = `${k.program.degree.code} · ${k.program.branch.code} · ${k.year}-${k.section}`;
      const file = `${k.program.degree.code}-${k.program.branch.code}-${k.year}${k.section}`.replace(/[^\w-]/g, "");
      const g = groups.get(k.id) ?? { classLabel: label, fileLabel: file, rows: [] };
      g.rows.push({
        registerNumber: s.registerNumber,
        rollNumber: s.rollNumber ?? "",
        name: s.user.displayName,
        email: s.user.email,
        tempPassword: password,
      });
      groups.set(k.id, g);
    }

    return Response.json({
      // One entry per class — the client writes a separate CSV from each, since
      // slips are handed out class by class.
      groups: [...groups.entries()].map(([classId, g]) => ({
        classId, classLabel: g.classLabel, fileLabel: g.fileLabel, students: g.rows,
      })),
      total: [...groups.values()].reduce((n, g) => n + g.rows.length, 0),
      failed,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
