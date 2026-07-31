// Body validation for POST /api/marks (src/app/api/marks/route.ts).
//
// The grid posts one entry per filled CELL (student × component). The rules that
// protect the data: a mark can't exceed ITS OWN column's maximum (10 for a test
// or assignment, 60 for the IAT paper — not the assessment's 100), a component
// must belong to the assessment being saved, and a blank cell is skipped rather
// than stored as a zero.
import { describe, it, expect } from "vitest";

import { parseBody } from "@/app/api/marks/route";

const base = { classId: "class-2a", subjectId: "subject-ds", assessment: "IA1" as const };
const ok = (body: unknown) => {
  const r = parseBody(body);
  if ("error" in r) throw new Error(`expected success, got: ${r.error}`);
  return r;
};
const err = (body: unknown) => {
  const r = parseBody(body);
  if (!("error" in r)) throw new Error("expected an error, got success");
  return r.error;
};

describe("per-component maximums", () => {
  it("accepts a cycle-test mark up to 10", () => {
    const r = ok({ ...base, marks: [{ studentId: "s1", component: "IA1_CT1", obtained: 10 }] });
    expect(r.marks).toEqual([{ studentId: "s1", component: "IA1_CT1", obtained: 10 }]);
  });

  it("REJECTS 11 in a /10 column, naming the column", () => {
    const e = err({ ...base, marks: [{ studentId: "s1", component: "IA1_CT1", obtained: 11 }] });
    expect(e).toMatch(/cycle test 1 is out of 10/i);
  });

  it("accepts 60 in the IAT column but refuses 61", () => {
    expect(ok({ ...base, marks: [{ studentId: "s1", component: "IA1_EXAM", obtained: 60 }] }).marks)
      .toHaveLength(1);
    expect(err({ ...base, marks: [{ studentId: "s1", component: "IA1_EXAM", obtained: 61 }] })).toMatch(
      /iat is out of 60/i,
    );
  });

  it("does not let a component borrow the assessment's 100", () => {
    // The whole point of per-column maxima: 100 is the TOTAL, not a cell's limit.
    expect(err({ ...base, marks: [{ studentId: "s1", component: "IA1_ASG1", obtained: 100 }] })).toMatch(
      /out of 10/i,
    );
  });

  it("allows the full 100 for Model, which is a single component", () => {
    const r = ok({
      ...base,
      assessment: "MODEL",
      marks: [{ studentId: "s1", component: "MODEL", obtained: 100 }],
    });
    expect(r.marks[0].obtained).toBe(100);
  });

  it("rejects negatives and non-numbers", () => {
    expect(err({ ...base, marks: [{ studentId: "s1", component: "IA1_CT1", obtained: -1 }] })).toMatch(
      /zero or more/i,
    );
    expect(err({ ...base, marks: [{ studentId: "s1", component: "IA1_CT1", obtained: "abc" }] })).toMatch(
      /zero or more/i,
    );
  });
});

describe("components must belong to the assessment", () => {
  it("refuses an IA2 component posted under IA1", () => {
    // Otherwise saving IAT 1 could silently overwrite an IAT 2 mark.
    expect(err({ ...base, marks: [{ studentId: "s1", component: "IA2_CT1", obtained: 5 }] })).toMatch(
      /invalid assessment component/i,
    );
  });

  it("refuses MODEL posted under IA1, and an IAT part under MODEL", () => {
    expect(err({ ...base, marks: [{ studentId: "s1", component: "MODEL", obtained: 5 }] })).toMatch(
      /invalid assessment component/i,
    );
    expect(
      err({ ...base, assessment: "MODEL", marks: [{ studentId: "s1", component: "IA1_CT1", obtained: 5 }] }),
    ).toMatch(/invalid assessment component/i);
  });

  it("refuses an unknown component name", () => {
    expect(err({ ...base, marks: [{ studentId: "s1", component: "IA1_CT9", obtained: 5 }] })).toMatch(
      /invalid assessment component/i,
    );
    expect(err({ ...base, marks: [{ studentId: "s1", component: "", obtained: 5 }] })).toMatch(
      /invalid assessment component/i,
    );
  });

  it("rejects a dropped assessment value outright", () => {
    expect(err({ ...base, assessment: "ASSIGNMENT", marks: [] })).toMatch(/invalid assessment/i);
  });
});

describe("blank cells and duplicates", () => {
  it("skips blank cells instead of storing zeros", () => {
    const r = ok({
      ...base,
      marks: [
        { studentId: "s1", component: "IA1_CT1", obtained: "" },
        { studentId: "s1", component: "IA1_CT2", obtained: null },
        { studentId: "s1", component: "IA1_ASG1", obtained: 7 },
      ],
    });
    expect(r.marks).toEqual([{ studentId: "s1", component: "IA1_ASG1", obtained: 7 }]);
  });

  it("keeps an explicit zero — a real mark, not a blank", () => {
    const r = ok({ ...base, marks: [{ studentId: "s1", component: "IA1_CT1", obtained: 0 }] });
    expect(r.marks[0].obtained).toBe(0);
  });

  it("rejects two cells for the same student and component", () => {
    // They'd race on the same unique row (student, subject, semester, component).
    expect(
      err({
        ...base,
        marks: [
          { studentId: "s1", component: "IA1_CT1", obtained: 5 },
          { studentId: "s1", component: "IA1_CT1", obtained: 8 },
        ],
      }),
    ).toMatch(/duplicate mark/i);
  });

  it("allows the same student across different components", () => {
    const r = ok({
      ...base,
      marks: [
        { studentId: "s1", component: "IA1_CT1", obtained: 9 },
        { studentId: "s1", component: "IA1_EXAM", obtained: 55 },
      ],
    });
    expect(r.marks).toHaveLength(2);
  });
});

describe("required fields", () => {
  it("needs a class, a subject and a student on each mark", () => {
    expect(err({ ...base, classId: "", marks: [] })).toMatch(/class and subject are required/i);
    expect(err({ ...base, subjectId: "  ", marks: [] })).toMatch(/class and subject are required/i);
    expect(err({ ...base, marks: [{ studentId: "", component: "IA1_CT1", obtained: 5 }] })).toMatch(
      /every mark needs a student/i,
    );
  });

  it("rejects a malformed body", () => {
    expect(err(null)).toMatch(/missing request body/i);
    expect(err({ ...base, marks: "not-a-list" })).toMatch(/marks must be a list/i);
    expect(err({ ...base, marks: ["nope"] })).toMatch(/invalid mark entry/i);
  });

  it("accepts an empty marks list — clearing the grid saves nothing", () => {
    expect(ok({ ...base, marks: [] }).marks).toEqual([]);
  });
});
