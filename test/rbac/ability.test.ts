// The CASL ability factory — the authorization engine (src/lib/rbac/ability.ts).
//
// This is the highest-value suite in the repo: it pins the wildcard semantics the
// whole permission model leans on, and the `{ programId }` condition that keeps one
// program's staff out of another's records.
import { describe, it, expect } from "vitest";

import { defineAbilityFor } from "@/lib/rbac/ability";
import { subject as asSubject } from "@casl/ability";

// Mirrors how `authorize` tags a resource before asking CASL.
const tagged = (s: string, resource: Record<string, unknown>) =>
  asSubject(s, resource) as unknown as Record<PropertyKey, unknown>;

describe("defineAbilityFor — wildcards", () => {
  it("grants exactly the (action, subject) pair it was given", () => {
    const ability = defineAbilityFor([{ action: "read", subject: "Student" }]);
    expect(ability.can("read", "Student")).toBe(true);
    expect(ability.can("update", "Student")).toBe(false);
    expect(ability.can("read", "Faculty")).toBe(false);
  });

  it("'manage' covers every action on that subject", () => {
    const ability = defineAbilityFor([{ action: "manage", subject: "Student" }]);
    for (const action of ["read", "create", "update", "delete", "mark", "anything"]) {
      expect(ability.can(action, "Student")).toBe(true);
    }
    // …but does not spill onto other subjects.
    expect(ability.can("read", "Faculty")).toBe(false);
  });

  it("the 'all' subject covers every subject", () => {
    const ability = defineAbilityFor([{ action: "read", subject: "all" }]);
    expect(ability.can("read", "Student")).toBe(true);
    expect(ability.can("read", "Attendance")).toBe(true);
    // …but only for the granted action.
    expect(ability.can("delete", "Student")).toBe(false);
  });

  it("'manage all' is full access — the Super Admin grant", () => {
    const ability = defineAbilityFor([{ action: "manage", subject: "all" }]);
    expect(ability.can("delete", "Student")).toBe(true);
    expect(ability.can("mark", "Attendance")).toBe(true);
    expect(ability.can("whatever", "Anything")).toBe(true);
  });

  it("grants nothing when there are no grants (deny by default)", () => {
    const ability = defineAbilityFor([]);
    expect(ability.can("read", "Student")).toBe(false);
    expect(ability.can("manage", "all")).toBe(false);
  });

  it("is an allow-list — there is no explicit deny, only absence", () => {
    // The /access console composes permissions as an allow-list; "blocked" means
    // "not granted". Two grants union; nothing can subtract.
    const ability = defineAbilityFor([
      { action: "read", subject: "Student" },
      { action: "update", subject: "Student" },
    ]);
    expect(ability.can("read", "Student")).toBe(true);
    expect(ability.can("update", "Student")).toBe(true);
    expect(ability.can("delete", "Student")).toBe(false);
  });
});

describe("defineAbilityFor — programId conditions (the scoping rule)", () => {
  const PROG_A = "program-a";
  const PROG_B = "program-b";
  const scoped = () =>
    defineAbilityFor([
      { action: "read", subject: "Student", conditions: { programId: PROG_A } },
    ]);

  it("allows a resource inside the user's own program", () => {
    expect(scoped().can("read", tagged("Student", { programId: PROG_A }))).toBe(true);
  });

  it("denies a resource in another program", () => {
    expect(scoped().can("read", tagged("Student", { programId: PROG_B }))).toBe(false);
  });

  it("denies a resource whose programId is null", () => {
    expect(scoped().can("read", tagged("Student", { programId: null }))).toBe(false);
  });

  it("an INSTITUTION grant (no conditions) spans every program", () => {
    const ability = defineAbilityFor([{ action: "read", subject: "Student" }]);
    expect(ability.can("read", tagged("Student", { programId: PROG_A }))).toBe(true);
    expect(ability.can("read", tagged("Student", { programId: PROG_B }))).toBe(true);
    expect(ability.can("read", tagged("Student", { programId: null }))).toBe(true);
  });

  it("⚠️ a conditional grant checked WITHOUT a resource passes — the documented trap", () => {
    // This is why PROJECT-GUIDE.md §3 insists on passing `{ programId }`. CASL
    // cannot evaluate a condition with no instance to evaluate it against, so the
    // bare check succeeds even for a program-scoped role. Omitting the resource
    // argument is what silently turns a scoped check into an unscoped one.
    expect(scoped().can("read", "Student")).toBe(true);
    // Contrast: with the resource supplied, another program is correctly refused.
    expect(scoped().can("read", tagged("Student", { programId: PROG_B }))).toBe(false);
  });

  it("scopes 'manage' grants too", () => {
    const ability = defineAbilityFor([
      { action: "manage", subject: "Attendance", conditions: { programId: PROG_A } },
    ]);
    expect(ability.can("mark", tagged("Attendance", { programId: PROG_A }))).toBe(true);
    expect(ability.can("mark", tagged("Attendance", { programId: PROG_B }))).toBe(false);
  });

  it("keeps two program-scoped grants independent", () => {
    const ability = defineAbilityFor([
      { action: "read", subject: "Student", conditions: { programId: PROG_A } },
      { action: "read", subject: "Faculty", conditions: { programId: PROG_B } },
    ]);
    expect(ability.can("read", tagged("Student", { programId: PROG_A }))).toBe(true);
    expect(ability.can("read", tagged("Student", { programId: PROG_B }))).toBe(false);
    expect(ability.can("read", tagged("Faculty", { programId: PROG_B }))).toBe(true);
    expect(ability.can("read", tagged("Faculty", { programId: PROG_A }))).toBe(false);
  });
});
