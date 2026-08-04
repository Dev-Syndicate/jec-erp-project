// The cross-department teaching rule: WHERE may a lecturer be timetabled?
//
// Pinning this matters because the rule was previously a bare `===` inlined in
// two routes, and both were wrong in the same way: an S&H lecturer could only
// ever be put on a grid S&H itself owned, which contradicts how the college runs
// (S&H teaches first year for every department, and its staff visit others).
//
// decideTeaching is the pure half — every fact is passed in — so the rule is
// testable without a database, which the suite forbids touching anyway.
import { describe, it, expect } from "vitest";

import { decideTeaching, type TeachingFacts } from "@/lib/teaching";

const CSE = "dept-cse";
const SNH = "dept-snh";

// An active S&H lecturer with no loans — the baseline every case varies from.
function lecturer(overrides: Partial<TeachingFacts> = {}): TeachingFacts {
  return {
    status: "ACTIVE",
    isStudent: false,
    homeDepartmentId: SNH,
    hasAttachment: false,
    ...overrides,
  };
}

describe("decideTeaching", () => {
  it("allows teaching in the department that employs them", () => {
    expect(decideTeaching(lecturer(), SNH)).toEqual({ ok: true, via: "home" });
  });

  it("refuses another department without an attachment", () => {
    const result = decideTeaching(lecturer(), CSE);
    expect("error" in result).toBe(true);
  });

  // The whole point of the slice: this is the S&H-lecturer-takes-a-CSE-hour case.
  it("allows another department WITH an attachment", () => {
    expect(decideTeaching(lecturer({ hasAttachment: true }), CSE)).toEqual({
      ok: true,
      via: "attachment",
    });
  });

  // Employment wins over a loan to the same place, so `via` stays meaningful.
  it("reports which rule allowed it, so callers can tell home from loan", () => {
    expect(decideTeaching(lecturer({ hasAttachment: true }), SNH)).toEqual({
      ok: true,
      via: "home",
    });
  });

  // An attachment is not a way to revive a disabled account. Checked BEFORE the
  // attachment, so a stale loan on a deactivated lecturer grants nothing.
  it("refuses an inactive account even when attached", () => {
    const result = decideTeaching(
      lecturer({ status: "INACTIVE", hasAttachment: true }),
      CSE,
    );
    expect("error" in result).toBe(true);
  });

  it("refuses an inactive account in its own department", () => {
    const result = decideTeaching(lecturer({ status: "INACTIVE" }), SNH);
    expect("error" in result).toBe(true);
  });

  // Defence in depth: a student must never hold a teaching slot, even if a bad
  // data fix gave them a faculty profile and an attachment.
  it("refuses a student account outright", () => {
    const result = decideTeaching(
      lecturer({ isStudent: true, homeDepartmentId: CSE, hasAttachment: true }),
      CSE,
    );
    expect("error" in result).toBe(true);
  });

  it("refuses an account with no faculty profile", () => {
    const result = decideTeaching(lecturer({ homeDepartmentId: null }), CSE);
    expect("error" in result).toBe(true);
  });

  // An attachment is to ONE host department; it must not act as a global pass.
  it("does not let an attachment authorise a third department", () => {
    // hasAttachment is resolved per-target by the caller, so a lookup against a
    // department they aren't attached to arrives as false.
    const result = decideTeaching(lecturer({ hasAttachment: false }), "dept-mech");
    expect("error" in result).toBe(true);
  });

  it("names the missing attachment in the refusal, not just 'wrong department'", () => {
    const result = decideTeaching(lecturer(), CSE);
    expect("error" in result && result.error).toContain("attachment");
  });
});
