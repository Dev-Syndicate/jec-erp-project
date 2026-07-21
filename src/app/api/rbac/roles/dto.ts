// Shared RBAC role mapping + validation — colocated with the routes and reused by
// the list/create/update handlers so every response matches the client type.
import "server-only";

import { db } from "@/lib/db";

export const ROLE_INCLUDE = {
  permissions: { select: { permissionId: true } },
  _count: { select: { users: true } },
} as const;

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  scope: "PROGRAM" | "INSTITUTION";
  isSystem: boolean;
  permissions: Array<{ permissionId: string }>;
  _count: { users: number };
};

export function toRoleDto(r: RoleRow) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    scope: r.scope,
    isSystem: r.isSystem,
    permissionIds: r.permissions.map((p) => p.permissionId),
    userCount: r._count.users,
  };
}

/**
 * Validate a set of permission ids for assignment to a custom/system role. All
 * must exist, and NONE may be the "manage/all" wildcard — that grant is reserved
 * for the bootstrapped Super Admin and can't be handed out via the console (it
 * would mint an all-powerful role). Returns the de-duplicated ids or an error.
 */
export async function validatePermissionIds(
  ids: string[],
): Promise<{ ok: string[] } | { error: string }> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { ok: [] };

  const found = await db.permission.findMany({
    where: { id: { in: unique } },
    select: { id: true, subject: true },
  });
  if (found.length !== unique.length) return { error: "One or more permissions no longer exist." };
  if (found.some((p) => p.subject === "all")) {
    return { error: "The full-access permission can't be granted here." };
  }
  return { ok: found.map((p) => p.id) };
}
