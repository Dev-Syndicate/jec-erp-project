// Small helpers to classify Prisma errors without importing the Prisma error
// class everywhere (keeps routes decoupled; Prisma's codes are stable). Used by
// the Structure CRUD routes to turn constraint failures into clean 409s instead
// of leaking a 500.
//
//   P2002 — unique constraint failed (duplicate name/code)
//   P2003 — foreign-key constraint failed (delete blocked by dependents)
//   P2025 — record not found (update/delete of a missing id)

function hasCode(e: unknown, code: string): boolean {
  return (
    typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === code
  );
}

/** True for a unique-constraint violation (e.g. duplicate degree code). */
export function isUniqueViolation(e: unknown): boolean {
  return hasCode(e, "P2002");
}

/** True when a write violates a foreign key — e.g. deleting a row with dependents. */
export function isForeignKeyViolation(e: unknown): boolean {
  return hasCode(e, "P2003");
}

/** True when the targeted record doesn't exist (update/delete of a missing id). */
export function isNotFound(e: unknown): boolean {
  return hasCode(e, "P2025");
}
