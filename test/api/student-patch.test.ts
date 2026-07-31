// Body validation for PATCH /api/students/[id] — the route that makes a
// student's sign-in details editable.
//
// registerNumber and email are LOGIN HANDLES, so the rules worth pinning are the
// ones that would strand a student out of their account: neither may be blanked,
// and email must match the same shape the bulk importer accepts. The Firebase
// sync and rollback live in the handler and need a database, so they are not
// covered here (docs/PROJECT-GUIDE.md §8).
//
// Importing the route module is safe: vitest.config.mts stubs @/lib/db and
// @/lib/firebase-admin, and parsePatchBody touches neither.
import { describe, it, expect } from "vitest";

import { parsePatchBody } from "@/app/api/students/[id]/route";

/** Narrow the union — these helpers keep the assertions readable. */
const data = (body: unknown) => {
  const r = parsePatchBody(body);
  if ("error" in r) throw new Error(`expected success, got: ${r.error}`);
  return r.data;
};
const error = (body: unknown) => {
  const r = parsePatchBody(body);
  if (!("error" in r)) throw new Error("expected an error, got success");
  return r.error;
};

describe("register number — the student's login handle", () => {
  it("accepts a change and trims it", () => {
    expect(data({ registerNumber: "  310621104099  " }).registerNumber).toBe("310621104099");
  });

  it("REFUSES to blank it — that would strand the student's sign-in", () => {
    expect(error({ registerNumber: "" })).toMatch(/register number can't be empty/i);
    expect(error({ registerNumber: "   " })).toMatch(/register number can't be empty/i);
  });

  it("refuses a non-string", () => {
    expect(error({ registerNumber: 310621104099 })).toMatch(/register number can't be empty/i);
    expect(error({ registerNumber: null })).toMatch(/register number can't be empty/i);
  });

  it("is left untouched when absent — a partial patch must not clear it", () => {
    expect(data({ phone: "9876543210" })).not.toHaveProperty("registerNumber");
  });
});

describe("email — the Firebase identity", () => {
  it("accepts a valid address, trimmed and lower-cased", () => {
    // Lower-casing matters: Firebase treats addresses case-insensitively and
    // resolve-roll compares them, so storing mixed case invites a mismatch.
    expect(data({ email: "  Asha.Rao@Jeppiaar.ORG " }).email).toBe("asha.rao@jeppiaar.org");
  });

  it("REFUSES to blank it", () => {
    expect(error({ email: "" })).toMatch(/email can't be empty/i);
    expect(error({ email: "  " })).toMatch(/email can't be empty/i);
  });

  it.each(["not-an-email", "no@domain", "@example.com", "spaces in@example.com", "a@b@c.com"])(
    "rejects malformed address %s",
    (bad) => {
      expect(error({ email: bad })).toMatch(/invalid email/i);
    },
  );

  it("accepts the address shapes the bulk importer accepts", () => {
    // Both entry points must agree, or a row that imports cleanly could be
    // un-editable afterwards.
    for (const good of ["a@b.co", "first.last@sub.domain.org", "s+tag@x.io"]) {
      expect(data({ email: good }).email).toBe(good);
    }
  });

  it("is left untouched when absent", () => {
    expect(data({ phone: "9876543210" })).not.toHaveProperty("email");
  });
});

describe("identity fields alongside ordinary edits", () => {
  it("carries both sign-in details plus detail fields in one patch", () => {
    const d = data({
      displayName: " Stephan V ",
      registerNumber: " 25JETCS401 ",
      email: " Stephan@jeppiaarcollege.org ",
      phone: " 9042236071 ",
      status: "ACTIVE",
    });
    expect(d).toMatchObject({
      displayName: "Stephan V",
      registerNumber: "25JETCS401",
      email: "stephan@jeppiaarcollege.org",
      phone: "9042236071",
      status: "ACTIVE",
    });
  });

  it("rejects the whole patch if one identity field is invalid", () => {
    // Partial application would be worse than refusing: a half-changed identity
    // is exactly the divergence the route is built to avoid.
    expect(error({ displayName: "Fine", email: "broken" })).toMatch(/invalid email/i);
  });
});

describe("pre-existing behaviour still holds", () => {
  it("roll number is optional and clears to null", () => {
    expect(data({ rollNumber: "" }).rollNumber).toBeNull();
    expect(data({ rollNumber: "21CS001" }).rollNumber).toBe("21CS001");
  });

  it("name and phone may not be blanked", () => {
    expect(error({ displayName: "  " })).toMatch(/name can't be empty/i);
    expect(error({ phone: "" })).toMatch(/phone can't be empty/i);
  });

  it("rejects an unknown lifecycle status", () => {
    expect(error({ status: "EXPELLED" })).toMatch(/invalid status/i);
    expect(data({ status: "GRADUATED" }).status).toBe("GRADUATED");
  });

  it("rejects an invalid date of birth", () => {
    expect(error({ dateOfBirth: "not a date" })).toMatch(/date of birth is invalid/i);
  });

  it("rejects an empty patch rather than issuing a no-op write", () => {
    expect(error({})).toMatch(/nothing to update/i);
    expect(error(null)).toMatch(/missing request body/i);
    expect(error("string")).toMatch(/missing request body/i);
  });
});
