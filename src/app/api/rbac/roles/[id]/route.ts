// /api/rbac/roles/[id] — update a role's description/scope/permissions, or delete
// a custom role. Super-Admin only. params is a Promise in Next 16 — await it.
//
// Guardrails (enforced here in addition to the `manage Role` permission check):
//   - The Super Admin role can't be modified at all (locked full access).
//   - System roles (HOD/Faculty/Student) can't be renamed or re-scoped, and can't
//     be deleted — only their permission set is editable.
//   - A role still assigned to users can't be deleted (reassign first).
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { ROLE_INCLUDE, toRoleDto, validatePermissionIds } from "../dto";

export const dynamic = "force-dynamic";

const SCOPES = ["PROGRAM", "INSTITUTION"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Role");
    const { id } = await params;

    const role = await db.role.findUnique({ where: { id }, select: { id: true, name: true, isSystem: true, scope: true } });
    if (!role) return Response.json({ error: "Role not found." }, { status: 404 });

    if (role.name === "Super Admin") {
      return Response.json({ error: "The Super Admin role can't be modified." }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return Response.json({ error: "Missing request body." }, { status: 400 });

    const data: { name?: string; description?: string | null; scope?: "PROGRAM" | "INSTITUTION" } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return Response.json({ error: "A role name is required." }, { status: 400 });
      if (role.isSystem && name !== role.name) {
        return Response.json({ error: "A system role can't be renamed." }, { status: 400 });
      }
      data.name = name;
    }
    if (body.description !== undefined) {
      data.description =
        typeof body.description === "string" && body.description.trim() !== ""
          ? body.description.trim()
          : null;
    }
    if (body.scope !== undefined) {
      if (!SCOPES.includes(body.scope as (typeof SCOPES)[number])) {
        return Response.json({ error: "Invalid scope." }, { status: 400 });
      }
      if (role.isSystem && body.scope !== role.scope) {
        return Response.json({ error: "A system role's scope is fixed." }, { status: 400 });
      }
      data.scope = body.scope as (typeof SCOPES)[number];
    }

    // Permission set is optional; when present it REPLACES the whole set.
    let permissionIds: string[] | undefined;
    if (body.permissionIds !== undefined) {
      const raw = Array.isArray(body.permissionIds)
        ? (body.permissionIds.filter((p): p is string => typeof p === "string") as string[])
        : [];
      const perms = await validatePermissionIds(raw);
      if ("error" in perms) return Response.json({ error: perms.error }, { status: 400 });
      permissionIds = perms.ok;
    }

    if (Object.keys(data).length === 0 && permissionIds === undefined) {
      return Response.json({ error: "Nothing to update." }, { status: 400 });
    }

    try {
      await db.$transaction(async (tx) => {
        if (Object.keys(data).length > 0) {
          await tx.role.update({ where: { id }, data });
        }
        if (permissionIds !== undefined) {
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          if (permissionIds.length > 0) {
            await tx.rolePermission.createMany({
              data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
            });
          }
        }
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return Response.json({ error: "A role with that name already exists." }, { status: 409 });
      }
      throw e;
    }

    const updated = await db.role.findUniqueOrThrow({ where: { id }, include: ROLE_INCLUDE });
    return Response.json(toRoleDto(updated));
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Role");
    const { id } = await params;

    const role = await db.role.findUnique({
      where: { id },
      select: { id: true, isSystem: true, _count: { select: { users: true } } },
    });
    if (!role) return Response.json({ error: "Role not found." }, { status: 404 });

    if (role.isSystem) {
      return Response.json({ error: "System roles can't be deleted." }, { status: 409 });
    }
    if (role._count.users > 0) {
      return Response.json(
        {
          error: `${role._count.users} ${role._count.users === 1 ? "user still has" : "users still have"} this role. Reassign them first.`,
        },
        { status: 409 },
      );
    }

    // No FK cascade on RolePermission — clear grants, then delete the role.
    await db.$transaction([
      db.rolePermission.deleteMany({ where: { roleId: id } }),
      db.role.delete({ where: { id } }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
