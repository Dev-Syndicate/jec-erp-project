// /api/rbac/roles — list all roles (with their permissions + user counts) and
// create custom roles. Super-Admin only: managing the RBAC config is an
// institution-level operation, distinct from /api/roles (the assignable-roles
// list the faculty picker reads).
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { ROLE_INCLUDE, toRoleDto, validatePermissionIds } from "./dto";

export const dynamic = "force-dynamic";

const SCOPES = ["PROGRAM", "INSTITUTION"] as const;

export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Role");

    const roles = await db.role.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: ROLE_INCLUDE,
    });

    return Response.json(roles.map(toRoleDto));
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Role");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description =
      typeof body?.description === "string" && body.description.trim() !== ""
        ? body.description.trim()
        : null;
    const scope = SCOPES.includes(body?.scope as (typeof SCOPES)[number])
      ? (body!.scope as (typeof SCOPES)[number])
      : "PROGRAM";
    const rawPermissionIds = Array.isArray(body?.permissionIds)
      ? (body.permissionIds.filter((p): p is string => typeof p === "string") as string[])
      : [];

    if (!name) return Response.json({ error: "A role name is required." }, { status: 400 });

    const perms = await validatePermissionIds(rawPermissionIds);
    if ("error" in perms) return Response.json({ error: perms.error }, { status: 400 });

    let role;
    try {
      role = await db.role.create({
        data: {
          name,
          description,
          scope,
          isSystem: false, // only the seed creates system roles
          permissions: { create: perms.ok.map((permissionId) => ({ permissionId })) },
        },
        include: ROLE_INCLUDE,
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return Response.json({ error: "A role with that name already exists." }, { status: 409 });
      }
      throw e;
    }

    return Response.json(toRoleDto(role), { status: 201 });
  } catch (err) {
    return toAuthResponse(err);
  }
}
