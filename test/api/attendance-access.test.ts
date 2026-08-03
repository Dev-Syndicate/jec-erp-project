// Period-marking authority (src/app/api/attendance/access.ts).
//
// The rule these pin: a subject hour is marked by the person who taught it, and
// no ROLE overrides that — not HOD, not Super Admin, not the class advisor.
// Marking a colleague's period would put their name on a register they never
// took.
//
// The one way someone else may mark it is an explicit, dated SlotSubstitution:
// a HOD assigns a covering teacher for that slot on that date. That is a GRANT,
// not a role — which is why a HOD can create one but still cannot mark the hour
// themselves. These tests pin both halves: the grant works, and the absence of a
// grant is not rescued by any permission.
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
const SLOT = "slot-1";

/** No substitution in play — the everyday case. */
const NO_COVER: ReadonlySet<string> = new Set();
/** This viewer has been assigned to cover SLOT on the date being marked. */
const COVERING: ReadonlySet<string> = new Set([SLOT]);

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
    expect(canMarkPeriod(subjectTeacher(), TEACHER, SLOT, NO_COVER)).toBe(true);
  });

  it("refuses another faculty member", () => {
    expect(canMarkPeriod(otherFaculty(), TEACHER, SLOT, NO_COVER)).toBe(false);
  });

  it("refuses a HOD who does not teach this period", () => {
    // `manage Attendance` is NOT an override here — this is the whole point.
    expect(canMarkPeriod(hod(), TEACHER, SLOT, NO_COVER)).toBe(false);
  });

  it("refuses Super Admin — `manage all` does not override either", () => {
    expect(canMarkPeriod(superAdmin(), TEACHER, SLOT, NO_COVER)).toBe(false);
  });

  it("allows a HOD for a period they DO teach", () => {
    // A HOD who actually teaches an hour marks it like any other teacher.
    expect(
      canMarkPeriod(ctx(TEACHER, [{ action: "manage", subject: "Attendance" }]), TEACHER, SLOT, NO_COVER),
    ).toBe(true);
  });

  it("ignores permissions entirely — identity is the only input", () => {
    // Same user id, wildly different grants: the answer never changes.
    for (const grants of [
      [] as Grant[],
      [{ action: "read", subject: "Attendance" }],
      [{ action: "manage", subject: "all" }],
    ]) {
      expect(canMarkPeriod(ctx(TEACHER, grants), TEACHER, SLOT, NO_COVER)).toBe(true);
      expect(canMarkPeriod(ctx(OTHER, grants), TEACHER, SLOT, NO_COVER)).toBe(false);
    }
  });
});

describe("canMarkPeriod — an assigned substitute", () => {
  it("allows a covering teacher for the slot they were assigned", () => {
    expect(canMarkPeriod(otherFaculty(), TEACHER, SLOT, COVERING)).toBe(true);
  });

  it("does not leak to OTHER periods — the grant is per slot", () => {
    // Covering period 3 must not confer period 4 as well.
    expect(canMarkPeriod(otherFaculty(), TEACHER, "slot-2", COVERING)).toBe(false);
  });

  it("still refuses a HOD with no substitution for this slot", () => {
    // The new path is a grant, not a role. A HOD assigns cover; they don't
    // inherit it, so `manage Attendance` remains no help on its own.
    expect(canMarkPeriod(hod(), TEACHER, SLOT, NO_COVER)).toBe(false);
    expect(canMarkPeriod(superAdmin(), TEACHER, SLOT, NO_COVER)).toBe(false);
  });

  it("lets the regular teacher mark even while someone is covering", () => {
    // Cover was arranged and the teacher turned up after all — they are still
    // the slot's faculty, so they keep the hour.
    expect(canMarkPeriod(subjectTeacher(), TEACHER, SLOT, COVERING)).toBe(true);
  });

  it("grants nothing to a user who holds no substitution", () => {
    // COVERING is resolved FOR THE CALLER (substitutionsFor filters on their own
    // id), so a third party never sees another user's grant in this set.
    expect(canMarkPeriod(ctx("third-party", []), TEACHER, SLOT, NO_COVER)).toBe(false);
  });
});

describe("assertMarksPeriod — the throwing form used by the POST", () => {
  it("passes for the period's teacher", () => {
    expect(() => assertMarksPeriod(subjectTeacher(), TEACHER, SLOT, NO_COVER)).not.toThrow();
  });

  it("passes for an assigned substitute", () => {
    expect(() => assertMarksPeriod(otherFaculty(), TEACHER, SLOT, COVERING)).not.toThrow();
  });

  it("throws AuthError 403 for anyone else, HOD included", () => {
    for (const c of [otherFaculty(), hod(), superAdmin()]) {
      expect(() => assertMarksPeriod(c, TEACHER, SLOT, NO_COVER)).toThrow(AuthError);
      try {
        assertMarksPeriod(c, TEACHER, SLOT, NO_COVER);
      } catch (e) {
        expect((e as AuthError).status).toBe(403);
        expect((e as AuthError).message).toMatch(/only mark attendance for a period you teach/i);
      }
    }
  });

  it("agrees with canMarkPeriod on every case", () => {
    for (const c of [subjectTeacher(), otherFaculty(), hod(), superAdmin()]) {
      for (const cover of [NO_COVER, COVERING]) {
        const allowed = canMarkPeriod(c, TEACHER, SLOT, cover);
        let threw = false;
        try {
          assertMarksPeriod(c, TEACHER, SLOT, cover);
        } catch {
          threw = true;
        }
        expect(allowed).toBe(!threw);
      }
    }
  });
});
