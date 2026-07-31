// Guards on the guards.
//
// The whole unit suite rests on one claim: these tests cannot touch Neon or
// Firebase. The dev database holds 473 real students' PII, so that claim is worth
// asserting rather than trusting. If someone later relaxes an alias in
// vitest.config.mts, these fail.
import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { verifyIdToken } from "@/lib/firebase-admin";

// At RUNTIME these resolve to the stubs in this directory, but `tsc` resolves the
// real modules (Vitest aliases are runtime-only), so reach for properties through
// `unknown` — the real PrismaClient has no string index signature.
const anyDb = db as unknown as Record<string, unknown>;
const anyVerify = verifyIdToken as unknown as () => unknown;

describe("the database is unreachable from unit tests", () => {
  it("throws on any model access instead of connecting", () => {
    expect(() => anyDb.student).toThrow(/must not touch the database/i);
    expect(() => anyDb.user).toThrow(/must not touch the database/i);
  });

  it("names the property that was reached, so the offending test is findable", () => {
    expect(() => anyDb.masterAttendance).toThrow(/db\.masterAttendance/);
  });

  it("points at the integration-suite escape hatch rather than just failing", () => {
    expect(() => anyDb.student).toThrow(/integration/i);
  });
});

describe("Firebase is unreachable from unit tests", () => {
  it("throws rather than performing a network token verification", () => {
    expect(() => anyVerify()).toThrow(/must not verify Firebase tokens/i);
  });
});
