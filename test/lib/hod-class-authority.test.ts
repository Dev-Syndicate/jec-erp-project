// A HOD runs their own department's classes — above all, naming the class teacher.
//
// This pins the two halves that make that safe, because granting the permission
// WITHOUT the scoping would hand every HOD authority over every class in the
// college. `manage Class` on its own is an institution-wide capability check; it
// only becomes "their own department" when the route passes the class's owning
// department as a resource.
//
// The routes themselves aren't reachable from this suite (they need a DB), so
// what's pinned here is the grant shape they rely on.
import { describe, expect, it } from "vitest";

import { buildGrants, type GrantRoles, type GrantUser } from "@/lib/auth";

const CSE = "prog-cse";

function hod(departmentId: string): GrantUser {
  return {
    programId: null, // staff carry no award
    facultyProfile: { departmentId, department: { programs: [{ id: CSE }] } },
  };
}

function roles(scope: string, pairs: Array<[string, string]>): GrantRoles {
  return [
    {
      role: {
        scope,
        permissions: pairs.map(([action, subject]) => ({ permission: { action, subject } })),
      },
    },
  ];
}

describe("a HOD's authority over classes", () => {
  it("carries the HOD's own department as a condition, never an open grant", () => {
    const user = { ...hod("dept-cse"), roles: roles("PROGRAM", [["manage", "Class"]]) };
    const [grant] = buildGrants(user);

    expect(grant.conditions).toEqual({ departmentId: "dept-cse" });
    // The failure this guards: an undefined condition is an INSTITUTION-WIDE
    // grant. If Class ever left the department allow-list, this would catch it.
    expect(grant.conditions).not.toBeUndefined();
  });

  it("scopes on the OWNER department, not the award the class leads to", () => {
    // The whole point: a first-year B.E·CSE class is owned by S&H, so the CSE HOD
    // must NOT reach it even though its award is theirs. The condition keys on the
    // department, so a class owned by S&H simply doesn't match.
    const user = { ...hod("dept-cse"), roles: roles("PROGRAM", [["manage", "Class"]]) };
    const [grant] = buildGrants(user);

    expect(grant.conditions).toEqual({ departmentId: "dept-cse" });
    expect(grant.conditions).not.toMatchObject({ departmentId: "dept-snh" });
  });

  it("gives a department-less account a sentinel that matches nothing", () => {
    // Defence in depth: a null department must not become "no condition", which
    // CASL would read as "everything".
    const user: GrantUser & { roles: GrantRoles } = {
      programId: null,
      facultyProfile: null,
      roles: roles("PROGRAM", [["manage", "Class"]]),
    };
    expect(buildGrants(user)[0].conditions).toEqual({ departmentId: "__none__" });
  });

  it("leaves Super Admin unscoped so they still reach every class", () => {
    const user = { ...hod("dept-cse"), roles: roles("INSTITUTION", [["manage", "all"]]) };
    expect(buildGrants(user)[0].conditions).toBeUndefined();
  });
});
