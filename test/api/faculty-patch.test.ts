// Body validation for PATCH /api/faculty/[id] — the route that makes a faculty
// member's staff ID and email editable.
//
// Only ONE of the two is a credential: faculty sign in with their email
// directly (no register-number resolution step), so a bad email locks the
// account out, while staffId is an administrative college id. Both are @unique.
// The Firebase sync and rollback live in the handler and need a database, so
// they are not covered here (docs/PROJECT-GUIDE.md §8).
import { describe, it, expect } from "vitest";

import { parsePatchBody } from "@/app/api/faculty/[id]/route";

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

describe("staff ID — the college identifier", () => {
  it("accepts a change and trims it", () => {
    expect(data({ staffId: "  CSE014  " }).staffId).toBe("CSE014");
  });

  it("refuses to blank it — it's a required unique column", () => {
    expect(error({ staffId: "" })).toMatch(/staff id can't be empty/i);
    expect(error({ staffId: "   " })).toMatch(/staff id can't be empty/i);
  });

  it("refuses a non-string", () => {
    expect(error({ staffId: 14 })).toMatch(/staff id can't be empty/i);
    expect(error({ staffId: null })).toMatch(/staff id can't be empty/i);
  });

  it("is left untouched when absent — a partial patch must not clear it", () => {
    expect(data({ phone: "9884946867" })).not.toHaveProperty("staffId");
  });
});

describe("email — the faculty credential", () => {
  it("accepts a valid address, trimmed and lower-cased", () => {
    expect(data({ email: "  Arshiya.M@Jeppiaarcollege.ORG " }).email).toBe(
      "arshiya.m@jeppiaarcollege.org",
    );
  });

  it("REFUSES to blank it — faculty authenticate on this address", () => {
    expect(error({ email: "" })).toMatch(/email can't be empty/i);
    expect(error({ email: "  " })).toMatch(/email can't be empty/i);
  });

  it.each(["not-an-email", "no@domain", "@example.com", "spaces in@example.com"])(
    "rejects malformed address %s",
    (bad) => {
      expect(error({ email: bad })).toMatch(/invalid email/i);
    },
  );

  it("uses the same shape rule as the student route and the importer", () => {
    for (const good of ["a@b.co", "first.last@sub.domain.org", "s+tag@x.io"]) {
      expect(data({ email: good }).email).toBe(good);
    }
  });

  it("is left untouched when absent", () => {
    expect(data({ phone: "9884946867" })).not.toHaveProperty("email");
  });
});

describe("identity alongside ordinary edits", () => {
  it("carries both identity fields plus detail fields in one patch", () => {
    const d = data({
      displayName: " M Arshiya Mobeen ",
      staffId: " CSE014 ",
      email: " Arshiya@jeppiaarcollege.org ",
      designation: " Assistant Professor ",
      status: "ACTIVE",
    });
    expect(d).toMatchObject({
      displayName: "M Arshiya Mobeen",
      staffId: "CSE014",
      email: "arshiya@jeppiaarcollege.org",
      designation: "Assistant Professor",
      status: "ACTIVE",
    });
  });

  it("rejects the whole patch if the email is invalid", () => {
    expect(error({ displayName: "Fine", email: "broken" })).toMatch(/invalid email/i);
  });
});

describe("pre-existing behaviour still holds", () => {
  it("name, designation and phone may not be blanked", () => {
    expect(error({ displayName: "  " })).toMatch(/name can't be empty/i);
    expect(error({ designation: "" })).toMatch(/designation can't be empty/i);
    expect(error({ phone: "" })).toMatch(/phone can't be empty/i);
  });

  it("emergency phone is optional and clears to null", () => {
    expect(data({ emergencyPhone: "" }).emergencyPhone).toBeNull();
    expect(data({ emergencyPhone: "9884946867" }).emergencyPhone).toBe("9884946867");
  });

  it("date of birth is nullable but rejects garbage", () => {
    expect(data({ dateOfBirth: "" }).dateOfBirth).toBeNull();
    expect(data({ dateOfBirth: null }).dateOfBirth).toBeNull();
    expect(error({ dateOfBirth: "not a date" })).toMatch(/date of birth is invalid/i);
  });

  it("requires at least one role when roles are sent", () => {
    expect(error({ roleIds: [] })).toMatch(/at least one role/i);
    expect(error({ roleIds: "Faculty" })).toMatch(/roles must be a list/i);
  });

  it("de-duplicates role ids", () => {
    expect(data({ roleIds: ["r1", "r1", "r2"] }).roleIds).toEqual(["r1", "r2"]);
  });

  it("rejects an unknown status and an empty program", () => {
    expect(error({ status: "RETIRED" })).toMatch(/invalid status/i);
    expect(error({ programId: "  " })).toMatch(/program can't be empty/i);
  });

  it("rejects an empty patch rather than issuing a no-op write", () => {
    expect(error({})).toMatch(/nothing to update/i);
    expect(error(null)).toMatch(/missing request body/i);
  });
});
