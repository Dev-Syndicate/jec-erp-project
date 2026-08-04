// The two-axis scoping model — `scopesFor` + `buildGrants` in src/lib/auth.ts.
//
// Both are extracted as pure functions precisely so this suite can reach them:
// they used to be inline inside `authenticate()`, which the DB-free suite cannot
// call at all. See docs/plan-department-model.md.
//
// The rule being pinned:
//   `Faculty`       -> { departmentId }               who EMPLOYS the person
//   everything else -> { programId: $in [...] }       which award owns the record
import { describe, expect, it } from "vitest";

import { buildGrants, scopesFor, type GrantRoles, type GrantUser } from "@/lib/auth";

const CSE = "prog-cse";
const CIVIL = "prog-civil";
const STRUCT = "prog-struct";

/** A staff member employed by `departmentId`, whose department runs `programs`. */
function staff(departmentId: string, programs: string[]): GrantUser {
  return {
    programId: null,
    facultyProfile: { departmentId, department: { programs: programs.map((id) => ({ id })) } },
  };
}

/** A student — no department, scoped by their own program. */
function student(programId: string | null): GrantUser {
  return { programId, facultyProfile: null };
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

describe("scopesFor", () => {
  it("derives a staff member's reach from their DEPARTMENT, not a stored program", () => {
    expect(scopesFor(staff("dept-cse", [CSE]))).toEqual({
      departmentId: "dept-cse",
      ownProgramIds: [CSE],
    });
  });

  it("covers EVERY award the department runs — the Civil case", () => {
    // A department may run programs across several branches. A HOD stored against
    // one programId could only ever administer one of them; deriving from the
    // department gives them both.
    const hod = staff("dept-civil", [CIVIL, STRUCT]);
    expect(scopesFor(hod).ownProgramIds).toEqual([CIVIL, STRUCT]);
  });

  it("gives a department that runs NO award an EMPTY reach", () => {
    // S&H. Its HOD manages S&H staff and holds no academic reach whatsoever —
    // safe by construction, not by a rule someone has to remember.
    expect(scopesFor(staff("dept-sh", []))).toEqual({
      departmentId: "dept-sh",
      ownProgramIds: [],
    });
  });

  it("scopes a STUDENT by their own program, not a department", () => {
    // Load-bearing: students have no FacultyProfile, so deriving their scope from
    // a department would return an empty set and lock all 473 of them out.
    expect(scopesFor(student(CSE))).toEqual({ departmentId: null, ownProgramIds: [CSE] });
  });

  it("gives a student with no program an empty reach rather than throwing", () => {
    expect(scopesFor(student(null))).toEqual({ departmentId: null, ownProgramIds: [] });
  });
});

describe("buildGrants — which axis scopes which subject", () => {
  it("puts `Faculty` on the EMPLOYMENT axis", () => {
    const user = { ...staff("dept-cse", [CSE]), roles: roles("PROGRAM", [["manage", "Faculty"]]) };
    expect(buildGrants(user)).toEqual([
      { action: "manage", subject: "Faculty", conditions: { departmentId: "dept-cse" } },
    ]);
  });

  it("puts every other subject on the ACADEMIC axis", () => {
    const user = {
      ...staff("dept-cse", [CSE]),
      roles: roles("PROGRAM", [["manage", "Class"], ["read", "Student"]]),
    };
    expect(buildGrants(user)).toEqual([
      { action: "manage", subject: "Class", conditions: { programId: { $in: [CSE] } } },
      { action: "read", subject: "Student", conditions: { programId: { $in: [CSE] } } },
    ]);
  });

  it("keeps `Student` on the ACADEMIC axis", () => {
    // A student's program IS their program — there is no separate employment
    // question for them, so they must not land on the department axis.
    const user = { ...staff("dept-cse", [CSE]), roles: roles("PROGRAM", [["manage", "Student"]]) };
    const [grant] = buildGrants(user);
    expect(grant.conditions).toEqual({ programId: { $in: [CSE] } });
  });

  it("leaves an INSTITUTION role unconditional", () => {
    // Super Admin spans everything; a condition would confine them.
    const user = { ...staff("dept-cse", [CSE]), roles: roles("INSTITUTION", [["manage", "all"]]) };
    expect(buildGrants(user)).toEqual([
      { action: "manage", subject: "all", conditions: undefined },
    ]);
  });

  it("matches every program the department runs", () => {
    const user = {
      ...staff("dept-civil", [CIVIL, STRUCT]),
      roles: roles("PROGRAM", [["manage", "Class"]]),
    };
    expect(buildGrants(user)[0].conditions).toEqual({ programId: { $in: [CIVIL, STRUCT] } });
  });

  describe("empty scopes fail CLOSED", () => {
    it("a PROGRAM role with no department matches nothing on the employment axis", () => {
      // `__none__` rather than null: a null condition would MATCH resources whose
      // departmentId is null, which is the opposite of failing closed.
      const user = { ...student(null), roles: roles("PROGRAM", [["manage", "Faculty"]]) };
      expect(buildGrants(user)[0].conditions).toEqual({ departmentId: "__none__" });
    });

    it("an S&H HOD's academic grants match NOTHING", () => {
      // `$in: []` matches no row on its own, so no sentinel is needed here.
      const user = { ...staff("dept-sh", []), roles: roles("PROGRAM", [["manage", "Class"]]) };
      expect(buildGrants(user)[0].conditions).toEqual({ programId: { $in: [] } });
    });
  });

  it("unions grants across several roles (HOD + Faculty)", () => {
    const user = {
      ...staff("dept-cse", [CSE]),
      roles: [
        ...roles("PROGRAM", [["manage", "Faculty"]]),
        ...roles("PROGRAM", [["mark", "Attendance"]]),
      ],
    };
    const grants = buildGrants(user);
    expect(grants).toHaveLength(2);
    // Each lands on the axis its own subject dictates — they don't conflict.
    expect(grants[0].conditions).toEqual({ departmentId: "dept-cse" });
    expect(grants[1].conditions).toEqual({ programId: { $in: [CSE] } });
  });
});
