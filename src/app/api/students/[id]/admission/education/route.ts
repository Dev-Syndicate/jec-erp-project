// PUT /api/students/[id]/admission/education — save the Educational Info step.
//
// Many rows per student (school / college / entrance), no natural unique key, so
// the payload is the full desired set and we replace-all in a transaction. The
// step is OPTIONAL — an empty list is valid and clears the records.
//
// Authorization: Super Admin (any dept) or HOD (own dept only).
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type RecordIn = {
  level: "SCHOOL" | "COLLEGE" | "ENTRANCE";
  instituteName?: string;
  board?: string | null;
  yearOfPassing?: string | number | null;
  hallTicketNo?: string | null;
  marks?: string | null;
  percentage?: string | number | null;
  gpa?: string | number | null;
  totalMPC?: string | number | null;
  obtainedMPC?: string | number | null;
  rank?: string | number | null;
};

type Body = { records?: RecordIn[] };

const str = (v: string | null | undefined) => (typeof v === "string" ? v.trim() || null : null);
const intOrNull = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
// Prisma Decimal accepts a string; keep it as a trimmed string or null.
const decOrNull = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  return s && Number.isFinite(Number(s)) ? s : null;
};

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const { id } = await params;
    const student = await db.student.findUnique({ where: { id }, include: { user: true } });
    if (!student) return Response.json({ error: "Student not found." }, { status: 404 });
    assertDeptScope(ctx, student.user.departmentId);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });

    const records = body.records ?? [];
    for (const r of records) {
      if (!r.instituteName?.trim()) {
        return Response.json(
          { error: "Each education record needs an institute/exam name." },
          { status: 400 },
        );
      }
    }

    const rows = records.map((r) => ({
      level: r.level,
      instituteName: r.instituteName!.trim(),
      board: str(r.board),
      yearOfPassing: intOrNull(r.yearOfPassing),
      hallTicketNo: str(r.hallTicketNo),
      marks: str(r.marks),
      percentage: decOrNull(r.percentage),
      gpa: decOrNull(r.gpa),
      totalMPC: intOrNull(r.totalMPC),
      obtainedMPC: intOrNull(r.obtainedMPC),
      rank: intOrNull(r.rank),
    }));

    await db.$transaction(async (tx) => {
      await tx.educationRecord.deleteMany({ where: { studentId: id } });
      if (rows.length) {
        await tx.educationRecord.createMany({
          data: rows.map((r) => ({ studentId: id, ...r })),
        });
      }
    });

    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
