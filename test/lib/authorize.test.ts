// `authorize` / `can` (src/lib/auth.ts) — step two of every API route.
//
// These wrap the ability with CASL's `subject()` tagging. The behaviour worth
// pinning is the difference between the capability form and the scoped form,
// because getting it wrong is the most plausible real security bug in this
// codebase (docs/PROJECT-GUIDE.md §3).
import { describe, it, expect } from "vitest";

import { authorize, can, AuthError } from "@/lib/auth";
import { superAdminCtx, programCtx, ctxFrom } from "../helpers/ability";

const PROG_A = "program-a";
const PROG_B = "program-b";

describe("authorize — capability form", () => {
  it("passes when the ability grants the pair", () => {
    const ctx = ctxFrom([{ action: "read", subject: "Student" }]);
    expect(() => authorize(ctx, "read", "Student")).not.toThrow();
  });

  it("throws AuthError 403 when it does not", () => {
    const ctx = ctxFrom([{ action: "read", subject: "Student" }]);
    expect(() => authorize(ctx, "delete", "Student")).toThrow(AuthError);
    try {
      authorize(ctx, "delete", "Student");
    } catch (e) {
      expect((e as AuthError).status).toBe(403);
      // The message is user-facing — it must not leak what was checked.
      expect((e as AuthError).message).not.toMatch(/Student|delete/);
    }
  });

  it("'manage all' authorizes anything — the Super Admin check", () => {
    const ctx = superAdminCtx();
    expect(() => authorize(ctx, "manage", "all")).not.toThrow();
    expect(() => authorize(ctx, "delete", "Degree")).not.toThrow();
  });

  it("a program role fails the `manage all` institution-admin gate", () => {
    const ctx = programCtx(PROG_A, [["manage", "Student"]]);
    expect(() => authorize(ctx, "manage", "all")).toThrow(AuthError);
  });
});

describe("authorize — scoped form (the program boundary)", () => {
  it("allows a resource in the user's own program", () => {
    const ctx = programCtx(PROG_A, [["read", "Student"]]);
    expect(() => authorize(ctx, "read", "Student", { programId: PROG_A })).not.toThrow();
  });

  it("REFUSES a resource in another program", () => {
    const ctx = programCtx(PROG_A, [["read", "Student"]]);
    expect(() => authorize(ctx, "read", "Student", { programId: PROG_B })).toThrow(AuthError);
  });

  it("refuses a resource with a null programId", () => {
    const ctx = programCtx(PROG_A, [["read", "Student"]]);
    expect(() => authorize(ctx, "read", "Student", { programId: null })).toThrow(AuthError);
  });

  it("Super Admin is unscoped — every program passes", () => {
    const ctx = superAdminCtx();
    expect(() => authorize(ctx, "read", "Student", { programId: PROG_A })).not.toThrow();
    expect(() => authorize(ctx, "read", "Student", { programId: PROG_B })).not.toThrow();
    expect(() => authorize(ctx, "read", "Student", { programId: null })).not.toThrow();
  });

  it("⚠️ omitting the resource degrades to an unscoped check", () => {
    // Regression guard for the trap in PROJECT-GUIDE.md §3. A program-scoped user
    // passes the bare check even for data they must not reach — the *only* thing
    // that enforces the boundary is passing the resource. If this ever starts
    // throwing, the API got stricter and that is good news worth reading about;
    // this assertion documents today's behaviour so the difference stays visible.
    const ctx = programCtx(PROG_A, [["read", "Student"]]);
    expect(() => authorize(ctx, "read", "Student")).not.toThrow();
    expect(() => authorize(ctx, "read", "Student", { programId: PROG_B })).toThrow(AuthError);
  });
});

describe("can — the non-throwing form", () => {
  it("returns booleans rather than throwing", () => {
    const ctx = programCtx(PROG_A, [["read", "Student"]]);
    expect(can(ctx, "read", "Student", { programId: PROG_A })).toBe(true);
    expect(can(ctx, "read", "Student", { programId: PROG_B })).toBe(false);
    expect(can(ctx, "delete", "Student", { programId: PROG_A })).toBe(false);
  });

  it("agrees with authorize on every case", () => {
    const ctx = programCtx(PROG_A, [["manage", "Attendance"]]);
    const cases: Array<{ programId: string | null }> = [
      { programId: PROG_A },
      { programId: PROG_B },
      { programId: null },
    ];
    for (const resource of cases) {
      const allowed = can(ctx, "mark", "Attendance", resource);
      let threw = false;
      try {
        authorize(ctx, "mark", "Attendance", resource);
      } catch {
        threw = true;
      }
      expect(allowed).toBe(!threw);
    }
  });
});
