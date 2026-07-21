// GET /api/rbac/permissions — the fine-grained permission catalog the RBAC admin
// composes roles from. Excludes the "manage/all" wildcard (subject "all"), which
// is reserved for Super Admin and never hand-assigned. Super-Admin only.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Role");

    const permissions = await db.permission.findMany({
      where: { subject: { not: "all" } },
      orderBy: [{ subject: "asc" }, { action: "asc" }],
      select: { id: true, action: true, subject: true },
    });

    return Response.json(permissions);
  } catch (err) {
    return toAuthResponse(err);
  }
}
