// Prisma error classification (src/lib/prisma-errors.ts).
//
// These turn constraint failures into clean 409s instead of a leaked 500, so the
// codes must be matched exactly — a loose check would misreport one failure as
// another and show the user the wrong message.
import { describe, it, expect } from "vitest";

import { isUniqueViolation, isForeignKeyViolation, isNotFound } from "@/lib/prisma-errors";

/** Shaped like a Prisma known-request error: an object carrying a `code`. */
const err = (code: string) => Object.assign(new Error(`Prisma error ${code}`), { code });

describe("classification", () => {
  it.each([
    ["P2002", isUniqueViolation, "unique violation"],
    ["P2003", isForeignKeyViolation, "foreign-key violation"],
    ["P2025", isNotFound, "not found"],
  ])("%s is recognised as a %s", (code, predicate) => {
    expect(predicate(err(code))).toBe(true);
  });

  it("each predicate matches ONLY its own code", () => {
    const predicates = [isUniqueViolation, isForeignKeyViolation, isNotFound];
    const codes = ["P2002", "P2003", "P2025"];
    codes.forEach((code, i) => {
      predicates.forEach((predicate, j) => {
        expect(predicate(err(code))).toBe(i === j);
      });
    });
  });

  it("does not match an unrelated Prisma code", () => {
    expect(isUniqueViolation(err("P2000"))).toBe(false);
    expect(isForeignKeyViolation(err("P1001"))).toBe(false);
    expect(isNotFound(err("P2016"))).toBe(false);
  });
});

describe("hostile / malformed inputs", () => {
  it.each([
    ["a plain Error with no code", new Error("boom")],
    ["null", null],
    ["undefined", undefined],
    ["a string", "P2002"],
    ["a number", 2002],
    ["an empty object", {}],
    ["an object whose code is not a string", { code: 2002 }],
  ])("returns false for %s", (_label, value) => {
    expect(isUniqueViolation(value)).toBe(false);
    expect(isForeignKeyViolation(value)).toBe(false);
    expect(isNotFound(value)).toBe(false);
  });

  it("is not fooled by a code on the prototype chain being absent", () => {
    // `"code" in e` walks the prototype chain, so confirm a real inherited code
    // still classifies — Prisma subclasses Error.
    class PrismaLike extends Error {
      code = "P2002";
    }
    expect(isUniqueViolation(new PrismaLike())).toBe(true);
  });
});
