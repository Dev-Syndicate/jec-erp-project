// PUT /api/students/[id]/admission/banks — save the Banks step.
//
// Many rows per student, no natural unique key, so the payload is the full set
// and we replace-all in a transaction. OPTIONAL — an empty list clears the banks.
// A bank row, when present, needs name / holder / account no / IFSC.
//
// Authorization: Super Admin (any dept) or HOD (own dept only).
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type BankIn = {
  bankName?: string;
  accountHolder?: string;
  accountNo?: string;
  ifscCode?: string;
  type?: string | null;
  branch?: string | null;
};

type Body = { banks?: BankIn[] };

const str = (v: string | null | undefined) => v?.trim() || null;

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

    const banks = body.banks ?? [];
    for (const b of banks) {
      if (!b.bankName?.trim() || !b.accountHolder?.trim() || !b.accountNo?.trim() || !b.ifscCode?.trim()) {
        return Response.json(
          { error: "Each bank needs a name, account holder, account number and IFSC code." },
          { status: 400 },
        );
      }
    }

    const rows = banks.map((b) => ({
      bankName: b.bankName!.trim(),
      accountHolder: b.accountHolder!.trim(),
      accountNo: b.accountNo!.trim(),
      ifscCode: b.ifscCode!.trim().toUpperCase(),
      type: str(b.type),
      branch: str(b.branch),
    }));

    await db.$transaction(async (tx) => {
      await tx.bankAccount.deleteMany({ where: { studentId: id } });
      if (rows.length) {
        await tx.bankAccount.createMany({ data: rows.map((r) => ({ studentId: id, ...r })) });
      }
    });

    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
