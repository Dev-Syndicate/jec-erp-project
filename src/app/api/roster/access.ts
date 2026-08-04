// Roster (enrollment) management scoping — who may add/remove students in a class.
// This is the class teacher's job: the class's own advisor manages its roster, and
// so does a `manage Student` holder (HOD/Super Admin), scoped to the department
// that OWNS the class. A plain subject teacher who merely teaches the class cannot.
// It's deliberately the SAME ownership rule as the day-record correction (the
// advisor owns the class).
//
// Department, not program: a student's department is DERIVED from the class they
// sit in this year, so a first-year in an S&H-owned class is S&H's to manage even
// though their award is B.E-CSE. Scoping on the award would hand them to the
// branch HOD a year early.
import "server-only";

import { authorize, type AuthContext } from "@/lib/auth";

export function assertManagesRoster(
  ctx: AuthContext,
  klass: { departmentId: string; advisorId: string | null },
): void {
  if (klass.advisorId && klass.advisorId === ctx.user.id) return; // the class teacher
  authorize(ctx, "manage", "Student", { departmentId: klass.departmentId }); // HOD/SA, scoped
}
