// PUT /api/students/[id]/admission/personal — save the Personal Info step:
// the student's guardians (father / mother / guardian) and addresses (present /
// permanent). Both are OPTIONAL — an empty submission is valid and clears them.
//
// Semantics: the payload is the full desired set. Slots present are upserted;
// slots absent are removed. This keeps the DB in sync with the form each save
// (there's no separate "delete a guardian" endpoint — you just resubmit without it).
//
// Authorization: Super Admin (any dept) or HOD (own dept only).
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type GuardianIn = {
  relation: "FATHER" | "MOTHER" | "GUARDIAN";
  fullName?: string;
  email?: string | null;
  mobile?: string | null;
  occupation?: string | null;
  annualIncome?: string | null;
  address?: string | null;
};

type AddressIn = {
  kind: "PRESENT" | "PERMANENT";
  countryId?: string;
  stateId?: string;
  districtId?: string;
  pincode?: string;
  type?: string;
  addressLine1?: string;
  addressLine2?: string | null;
};

type Body = { guardians?: GuardianIn[]; addresses?: AddressIn[] };

const clean = (v: string | null | undefined) => v?.trim() || null;

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

    const guardians = body.guardians ?? [];
    const addresses = body.addresses ?? [];

    // Per-item required-ness: a guardian needs a name; an address, when added,
    // needs its geo + line1 + pincode + type. (The step itself is optional.)
    for (const g of guardians) {
      if (!g.fullName?.trim()) {
        return Response.json(
          { error: `${g.relation.toLowerCase()} name is required to save that entry.` },
          { status: 400 },
        );
      }
    }
    for (const a of addresses) {
      if (!a.countryId || !a.stateId || !a.districtId || !a.addressLine1?.trim() || !a.pincode?.trim() || !a.type?.trim()) {
        return Response.json(
          { error: `${a.kind.toLowerCase()} address is incomplete — fill country, state, district, line 1, pincode and type.` },
          { status: 400 },
        );
      }
    }

    const keepGuardianRels = guardians.map((g) => g.relation);
    const keepAddressKinds = addresses.map((a) => a.kind);

    await db.$transaction(async (tx) => {
      // Drop slots no longer present (notIn [] would delete nothing, so empty
      // keep-sets omit the filter to clear all).
      await tx.guardian.deleteMany({
        where: {
          studentId: id,
          ...(keepGuardianRels.length ? { relation: { notIn: keepGuardianRels } } : {}),
        },
      });
      await tx.studentAddress.deleteMany({
        where: {
          studentId: id,
          ...(keepAddressKinds.length ? { kind: { notIn: keepAddressKinds } } : {}),
        },
      });

      for (const g of guardians) {
        const data = {
          fullName: g.fullName!.trim(),
          email: clean(g.email),
          mobile: clean(g.mobile),
          occupation: clean(g.occupation),
          annualIncome: clean(g.annualIncome),
          address: clean(g.address),
        };
        await tx.guardian.upsert({
          where: { studentId_relation: { studentId: id, relation: g.relation } },
          update: data,
          create: { studentId: id, relation: g.relation, ...data },
        });
      }

      for (const a of addresses) {
        const data = {
          countryId: a.countryId!,
          stateId: a.stateId!,
          districtId: a.districtId!,
          pincode: a.pincode!.trim(),
          type: a.type!.trim(),
          addressLine1: a.addressLine1!.trim(),
          addressLine2: clean(a.addressLine2),
        };
        await tx.studentAddress.upsert({
          where: { studentId_kind: { studentId: id, kind: a.kind } },
          update: data,
          create: { studentId: id, kind: a.kind, ...data },
        });
      }
    });

    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
