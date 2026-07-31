// Period-marking authority (src/app/api/attendance/access.ts).
//
// The rule these pin: a subject hour is marked by the person who taught it, and
// NOTHING overrides that — not HOD, not Super Admin, not the class advisor.
// Marking a colleague's period would put their name on a register they never
// took; covering an absent teacher means reassigning the timetable slot instead.
//
// This is deliberately stricter than the checks around it. `manage Attendance`
// still lets a HOD view any class and correct the DAY record — those paths hit
// the database (assertTeachesOrAdvises, assertOwnsDayRecord) and are not covered
// here; canMarkPeriod and assertMarksPeriod are pure.
import { describe, it, expect } from "vitest";

import { canMarkPeriod, assertMarksPeriod } from "@/app/api/attendance/access";
import { AuthError } from "@/lib/auth";
import { defineAbilityFor, type Grant } from "@/lib/rbac/ability";
import type { AuthContext } from "@/lib/auth";

const TEACHER = "faculty-teaching-this-period";
const OTHER = "someone-else";

/** An AuthContext with a given user id and permission grants. */
function ctx(userId: string, grants: Grant[]): AuthContext {
  return {
    user: { id: userId },
    ability: defineAbilityFor(grants),
  } as unknown as AuthContext;
}

const subjectTeacher = () => ctx(TEACHER, [{ action: "mark", subject: "Attendance" }]);
const otherFaculty = () => ctx(OTHER, [{ action: "mark", subject: "Attendance" }]);
const hod = () => ctx(OTHER, [{ action: "manage", subject: "Attendance" }]);
const superAdmin = () => ctx(OTHER, [{ action: "manage", subject: "all" }]);

describe("canMarkPeriod — the period's own teacher, and only them", () => {
  it("allows the faculty on this period's timetable slot", () => {
    expect(canMarkPeriod(subjectTeacher(), TEACHER)).toBe(true);
  });

  it("refuses another faculty member", () => {
    expect(canMarkPeriod(otherFaculty(), TEACHER)).toBe(false);
  });

  it("refuses a HOD who does not teach this period", () => {
    // `manage Attendance` is NOT an override here — this is the whole point.
    expect(canMarkPeriod(hod(), TEACHER)).toBe(false);
  });

  it("refuses Super Admin — `manage all` does not override either", () => {
    expect(canMarkPeriod(superAdmin(), TEACHER)).toBe(false);
  });

  it("allows a HOD for a period they DO teach", () => {
    // A HOD who actually teaches an hour marks it like any other teacher.
    expect(canMarkPeriod(ctx(TEACHER, [{ action: "manage", subject: "Attendance" }]), TEACHER)).toBe(
      true,
    );
  });

  it("ignores permissions entirely — identity is the only input", () => {
    // Same user id, wildly different grants: the answer never changes.
    for (const grants of [
      [] as Grant[],
      [{ action: "read", subject: "Attendance" }],
      [{ action: "manage", subject: "all" }],
    ]) {
      expect(canMarkPeriod(ctx(TEACHER, grants), TEACHER)).toBe(true);
      expect(canMarkPeriod(ctx(OTHER, grants), TEACHER)).toBe(false);
    }
  });
});

describe("assertMarksPeriod — the throwing form used by the POST", () => {
  it("passes for the period's teacher", () => {
    expect(() => assertMarksPeriod(subjectTeacher(), TEACHER)).not.toThrow();
  });

  it("throws AuthError 403 for anyone else, HOD included", () => {
    for (const c of [otherFaculty(), hod(), superAdmin()]) {
      expect(() => assertMarksPeriod(c, TEACHER)).toThrow(AuthError);
      try {
        assertMarksPeriod(c, TEACHER);
      } catch (e) {
        expect((e as AuthError).status).toBe(403);
        expect((e as AuthError).message).toMatch(/only mark attendance for a period you teach/i);
      }
    }
  });

  it("agrees with canMarkPeriod on every case", () => {
    for (const c of [subjectTeacher(), otherFaculty(), hod(), superAdmin()]) {
      const allowed = canMarkPeriod(c, TEACHER);
      let threw = false;
      try {
        assertMarksPeriod(c, TEACHER);
      } catch {
        threw = true;
      }
      expect(allowed).toBe(!threw);
    }
  });
});
