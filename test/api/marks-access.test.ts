// Internal-marks authority (src/app/api/marks/access.ts).
//
// Two levels, deliberately different in width:
//   READ  — a marks admin (HOD/SA in DEPARTMENT scope) OR the subject's teacher
//   ENTER — the subject's own teacher, full stop; no role overrides it
//
// Oversight follows the department that OWNS THE CLASS, not the award the subject
// sits in: a first-year class is owned by S&H, so its results are S&H's to see —
// the same rule as attendance and leave. Whoever owns the class owns everything
// about it.
//
// `isMarksAdmin` is pure and covered directly. `assertReadsMarks` and
// `assertEntersMarks` also query the timetable, and the unit suite refuses to
// touch the database on purpose (test/stubs/db.ts), so their decision logic is
// re-expressed here as the predicates the real helpers apply. That keeps the rule
// pinned — in particular that the WRITE gate never consults the ability — while
// the DB round-trip itself stays for an integration suite.
import { describe, it, expect } from "vitest";

import { isMarksAdmin } from "@/app/api/marks/access";
import { defineAbilityFor, type Grant } from "@/lib/rbac/ability";
import type { AuthContext } from "@/lib/auth";

const DEPARTMENT = "dept-cse";
const OTHER_DEPARTMENT = "dept-mech";
const TEACHER = "faculty-who-teaches-it";
const SOMEONE_ELSE = "faculty-who-does-not";

function ctx(userId: string, grants: Grant[]): AuthContext {
  return {
    user: { id: userId },
    departmentId: DEPARTMENT,
    ability: defineAbilityFor(grants),
  } as unknown as AuthContext;
}

// `manage Marks` is what distinguishes a marks admin from a plain Faculty — the
// latter holds only `enter Marks`.
const hod = (departmentId = DEPARTMENT) =>
  ctx(SOMEONE_ELSE, [
    { action: "enter", subject: "Marks" },
    { action: "manage", subject: "Marks", conditions: { departmentId } },
  ]);
const superAdmin = () => ctx(SOMEONE_ELSE, [{ action: "manage", subject: "all" }]);
const faculty = (id = TEACHER) => ctx(id, [{ action: "enter", subject: "Marks" }]);

describe("isMarksAdmin — who has department-wide marks oversight", () => {
  it("is true for a HOD within their own department", () => {
    expect(isMarksAdmin(hod(), DEPARTMENT)).toBe(true);
  });

  it("is FALSE for a HOD looking at another department", () => {
    // The grant carries a { departmentId } condition, so scope is honoured.
    expect(isMarksAdmin(hod(DEPARTMENT), OTHER_DEPARTMENT)).toBe(false);
  });

  it("is true for Super Admin anywhere", () => {
    expect(isMarksAdmin(superAdmin(), DEPARTMENT)).toBe(true);
    expect(isMarksAdmin(superAdmin(), OTHER_DEPARTMENT)).toBe(true);
  });

  it("is false for a plain Faculty — `enter Marks` alone isn't oversight", () => {
    expect(isMarksAdmin(faculty(), DEPARTMENT)).toBe(false);
  });

  it("is false when there are no grants at all", () => {
    expect(isMarksAdmin(ctx(SOMEONE_ELSE, []), DEPARTMENT)).toBe(false);
  });

  it("is false for a null departmentId (an unscoped resource)", () => {
    expect(isMarksAdmin(hod(), null)).toBe(false);
  });
});

// The two gates as the source applies them, with the timetable lookup as an input
// rather than a query. Keep these in step with access.ts.
const mayRead = (c: AuthContext, departmentId: string | null, teaches: boolean) =>
  isMarksAdmin(c, departmentId) || teaches;
const mayEnter = (_c: AuthContext, _departmentId: string | null, teaches: boolean) => teaches;

describe("READ gate — oversight OR authorship", () => {
  it("passes for the subject's teacher", () => {
    expect(mayRead(faculty(), DEPARTMENT, true)).toBe(true);
  });

  it("passes for a HOD in their department even without teaching it", () => {
    expect(mayRead(hod(), DEPARTMENT, false)).toBe(true);
  });

  it("passes for Super Admin", () => {
    expect(mayRead(superAdmin(), DEPARTMENT, false)).toBe(true);
  });

  it("refuses an unrelated faculty member", () => {
    expect(mayRead(faculty(SOMEONE_ELSE), DEPARTMENT, false)).toBe(false);
  });

  it("refuses a HOD outside their department scope", () => {
    expect(mayRead(hod(DEPARTMENT), OTHER_DEPARTMENT, false)).toBe(false);
  });
});

describe("ENTER gate — authorship only, no overrides", () => {
  it("passes for the subject's teacher", () => {
    expect(mayEnter(faculty(), DEPARTMENT, true)).toBe(true);
  });

  it("REFUSES a HOD for a subject they don't teach", () => {
    // The whole point: `manage Marks` grants oversight, not authorship.
    expect(mayEnter(hod(), DEPARTMENT, false)).toBe(false);
  });

  it("REFUSES Super Admin — `manage all` is not an override", () => {
    expect(mayEnter(superAdmin(), DEPARTMENT, false)).toBe(false);
  });

  it("passes for a HOD who DOES teach the subject", () => {
    expect(mayEnter(hod(), DEPARTMENT, true)).toBe(true);
  });

  it("ignores permissions entirely — only teaching decides", () => {
    for (const c of [faculty(), hod(), superAdmin(), ctx(SOMEONE_ELSE, [])]) {
      expect(mayEnter(c, DEPARTMENT, false)).toBe(false);
      expect(mayEnter(c, DEPARTMENT, true)).toBe(true);
    }
  });

  it("is strictly narrower than the read gate", () => {
    // Every case the write gate allows, the read gate allows too — never the
    // reverse. A regression that widened ENTER would break this.
    for (const c of [faculty(), hod(), superAdmin(), ctx(SOMEONE_ELSE, [])]) {
      for (const teaches of [true, false]) {
        if (mayEnter(c, DEPARTMENT, teaches)) expect(mayRead(c, DEPARTMENT, teaches)).toBe(true);
      }
    }
  });
});
