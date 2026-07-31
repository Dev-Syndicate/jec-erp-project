// The Year → Section → Subject narrowing behind the internal-marks picker.
//
// A HOD sees every (class × subject) in the department — 20+ flat entries, which
// is what made the old single select unusable. The rules worth pinning are the
// ones that decide what each level offers, and the auto-select that keeps the
// common case (a faculty teaching one class) to a single click.
//
// This mirrors the derivation inside AssignmentPicker; the component wires it to
// state. Keep the two in step.
import { describe, it, expect } from "vitest";

import type { MarkAssignment } from "@/features/marks/types";

const a = (
  year: number,
  section: string,
  subjectCode: string,
  canEnter = true,
): MarkAssignment => ({
  id: `c${year}${section}::${subjectCode}`,
  classId: `class-${year}${section}`,
  subjectId: `subject-${subjectCode}`,
  subjectCode,
  subjectName: `Subject ${subjectCode}`,
  classLabel: `B.E · CSE · ${year}-${section}`,
  year,
  section,
  programId: "program-cse",
  canEnter,
});

/** Levels as AssignmentPicker derives them. */
const years = (o: MarkAssignment[]) => [...new Set(o.map((x) => x.year))].sort((p, q) => p - q);
const sections = (o: MarkAssignment[], year: string) =>
  [...new Set(o.filter((x) => String(x.year) === year).map((x) => x.section))].sort((p, q) =>
    p.localeCompare(q),
  );
const subjects = (o: MarkAssignment[], year: string, section: string) =>
  o
    .filter((x) => String(x.year) === year && x.section === section)
    .sort((p, q) => p.subjectCode.localeCompare(q.subjectCode));

// A department-sized list: 3 years × sections × subjects.
const HOD_VIEW = [
  a(2, "A", "CS25C08"),
  a(2, "A", "CS25C09", false),
  a(2, "B", "CS25C08", false),
  a(2, "C", "CS25C11", false),
  a(3, "A", "CB3491", false),
  a(3, "B", "CS3491", false),
  a(4, "A", "CS3691", false),
];

describe("narrowing a department-sized list", () => {
  it("offers each year once, in order", () => {
    expect(years(HOD_VIEW)).toEqual([2, 3, 4]);
  });

  it("offers only the sections that exist in the chosen year", () => {
    expect(sections(HOD_VIEW, "2")).toEqual(["A", "B", "C"]);
    expect(sections(HOD_VIEW, "3")).toEqual(["A", "B"]);
    expect(sections(HOD_VIEW, "4")).toEqual(["A"]);
  });

  it("offers only the subjects taught to that exact class", () => {
    expect(subjects(HOD_VIEW, "2", "A").map((x) => x.subjectCode)).toEqual(["CS25C08", "CS25C09"]);
    expect(subjects(HOD_VIEW, "2", "B").map((x) => x.subjectCode)).toEqual(["CS25C08"]);
  });

  it("cuts 7 flat entries down to 2 at the final step", () => {
    // The point of the cascade: the last list is short enough to read.
    expect(HOD_VIEW.length).toBe(7);
    expect(subjects(HOD_VIEW, "2", "A").length).toBe(2);
  });

  it("never leaks a subject from another section", () => {
    for (const s of ["A", "B", "C"]) {
      for (const x of subjects(HOD_VIEW, "2", s)) expect(x.section).toBe(s);
    }
  });

  it("returns nothing for a year/section pair that doesn't exist", () => {
    expect(subjects(HOD_VIEW, "4", "C")).toEqual([]);
    expect(sections(HOD_VIEW, "9")).toEqual([]);
  });
});

describe("auto-select — a level with one choice shouldn't be asked", () => {
  const ONE_CLASS = [a(2, "A", "CS25C08"), a(2, "A", "CS25C09")];

  it("collapses year and section when a faculty teaches one class", () => {
    expect(years(ONE_CLASS)).toHaveLength(1);
    expect(sections(ONE_CLASS, "2")).toHaveLength(1);
    // Only the subject choice actually remains.
    expect(subjects(ONE_CLASS, "2", "A")).toHaveLength(2);
  });

  it("still narrows correctly when only one subject exists", () => {
    const ONE = [a(3, "B", "CS3491")];
    expect(years(ONE)).toEqual([3]);
    expect(sections(ONE, "3")).toEqual(["B"]);
    expect(subjects(ONE, "3", "B")).toHaveLength(1);
  });

  it("handles an empty assignment list without throwing", () => {
    expect(years([])).toEqual([]);
    expect(sections([], "2")).toEqual([]);
    expect(subjects([], "2", "A")).toEqual([]);
  });
});

describe("view-only flagging survives the narrowing", () => {
  it("keeps canEnter per subject, so the label can mark read-only entries", () => {
    const found = subjects(HOD_VIEW, "2", "A");
    expect(found.map((x) => x.canEnter)).toEqual([true, false]);
  });
});
