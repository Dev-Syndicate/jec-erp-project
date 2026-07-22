// Roster (enrollment) management scoping — who may add/remove students in a class.
// This is the class teacher's job: the class's own advisor manages its roster, and
// so does a `manage Student` holder (HOD/Super Admin), program-scoped. A plain
// subject teacher who merely teaches the class cannot. It's deliberately the SAME
// ownership rule as the day-record correction (the advisor owns the class).
import "server-only";

import { authorize, type AuthContext } from "@/lib/auth";

export function assertManagesRoster(
  ctx: AuthContext,
  klass: { programId: string; advisorId: string | null },
): void {
  if (klass.advisorId && klass.advisorId === ctx.user.id) return; // the class teacher
  authorize(ctx, "manage", "Student", { programId: klass.programId }); // HOD/SA, scoped
}
