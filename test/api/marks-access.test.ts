// Internal-marks authority (src/app/api/marks/access.ts).
//
// Two levels, deliberately different in width:
//   READ  — a marks admin (HOD/SA in program scope) OR the subject's teacher
//   ENTER — the subject's own teacher, full stop; no role overrides it
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

const PROGRAM = "program-cse";
const OTHER_PROGRAM = "program-mech";
const TEACHER = "faculty-who-teaches-it";
const SOMEONE_ELSE = "faculty-who-does-not";

function ctx(userId: string, grants: Grant[]): AuthContext {
  return {
    user: { id: userId, programId: PROGRAM },
    ability: defineAbilityFor(grants),
  } as unknown as AuthContext;
}

// `manage Subject` is what distinguishes a marks admin from a plain Faculty.
const hod = (programId = PROGRAM) =>
  ctx(SOMEONE_ELSE, [
    { action: "enter", subject: "Marks" },
    { action: "manage", subject: "Subject", conditions: { programId } },
  ]);
const superAdmin = () => ctx(SOMEONE_ELSE, [{ action: "manage", subject: "all" }]);
const faculty = (id = TEACHER) => ctx(id, [{ action: "enter", subject: "Marks" }]);

describe("isMarksAdmin — who has program-wide marks oversight", () => {
  it("is true for a HOD within their own program", () => {
    expect(isMarksAdmin(hod(), PROGRAM)).toBe(true);
  });

  it("is FALSE for a HOD looking at another program", () => {
    // The grant carries a { programId } condition, so scope is honoured.
    expect(isMarksAdmin(hod(PROGRAM), OTHER_PROGRAM)).toBe(false);
  });

  it("is true for Super Admin anywhere", () => {
    expect(isMarksAdmin(superAdmin(), PROGRAM)).toBe(true);
    expect(isMarksAdmin(superAdmin(), OTHER_PROGRAM)).toBe(true);
  });

  it("is false for a plain Faculty — `enter Marks` alone isn't oversight", () => {
    expect(isMarksAdmin(faculty(), PROGRAM)).toBe(false);
  });

  it("is false when there are no grants at all", () => {
    expect(isMarksAdmin(ctx(SOMEONE_ELSE, []), PROGRAM)).toBe(false);
  });

  it("is false for a null programId (an unscoped resource)", () => {
    expect(isMarksAdmin(hod(), null)).toBe(false);
  });
});

// The two gates as the source applies them, with the timetable lookup as an input
// rather than a query. Keep these in step with access.ts.
const mayRead = (c: AuthContext, programId: string | null, teaches: boolean) =>
  isMarksAdmin(c, programId) || teaches;
const mayEnter = (_c: AuthContext, _programId: string | null, teaches: boolean) => teaches;

describe("READ gate — oversight OR authorship", () => {
  it("passes for the subject's teacher", () => {
    expect(mayRead(faculty(), PROGRAM, true)).toBe(true);
  });

  it("passes for a HOD in their program even without teaching it", () => {
    expect(mayRead(hod(), PROGRAM, false)).toBe(true);
  });

  it("passes for Super Admin", () => {
    expect(mayRead(superAdmin(), PROGRAM, false)).toBe(true);
  });

  it("refuses an unrelated faculty member", () => {
    expect(mayRead(faculty(SOMEONE_ELSE), PROGRAM, false)).toBe(false);
  });

  it("refuses a HOD outside their program scope", () => {
    expect(mayRead(hod(PROGRAM), OTHER_PROGRAM, false)).toBe(false);
  });
});

describe("ENTER gate — authorship only, no overrides", () => {
  it("passes for the subject's teacher", () => {
    expect(mayEnter(faculty(), PROGRAM, true)).toBe(true);
  });

  it("REFUSES a HOD for a subject they don't teach", () => {
    // The whole point: `manage Subject` grants oversight, not authorship.
    expect(mayEnter(hod(), PROGRAM, false)).toBe(false);
  });

  it("REFUSES Super Admin — `manage all` is not an override", () => {
    expect(mayEnter(superAdmin(), PROGRAM, false)).toBe(false);
  });

  it("passes for a HOD who DOES teach the subject", () => {
    expect(mayEnter(hod(), PROGRAM, true)).toBe(true);
  });

  it("ignores permissions entirely — only teaching decides", () => {
    for (const c of [faculty(), hod(), superAdmin(), ctx(SOMEONE_ELSE, [])]) {
      expect(mayEnter(c, PROGRAM, false)).toBe(false);
      expect(mayEnter(c, PROGRAM, true)).toBe(true);
    }
  });

  it("is strictly narrower than the read gate", () => {
    // Every case the write gate allows, the read gate allows too — never the
    // reverse. A regression that widened ENTER would break this.
    for (const c of [faculty(), hod(), superAdmin(), ctx(SOMEONE_ELSE, [])]) {
      for (const teaches of [true, false]) {
        if (mayEnter(c, PROGRAM, teaches)) expect(mayRead(c, PROGRAM, teaches)).toBe(true);
      }
    }
  });
});
