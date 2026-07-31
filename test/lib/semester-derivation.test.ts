// Derived curriculum semester — one of the four app-enforced invariants
// (docs/PROJECT-GUIDE.md §1). `semesterNumber` is stored; `year` and `kind` are
// DERIVED from it and never persisted, so the two directions must stay inverse.
//
//   forward:  semesterNumber = (year − 1) × 2 + (kind === ODD ? 1 : 2)
//   backward: year = ceil(semesterNumber / 2),  kind = odd ? ODD : EVEN
//
// The backward direction is the one that ships, in api/subjects/dto.ts.
import { describe, it, expect } from "vitest";

import { toSubjectDto } from "@/app/api/subjects/dto";

/** The rule as CLAUDE.md states it — the reference the shipped code must match. */
const forward = (year: number, kind: "ODD" | "EVEN") => (year - 1) * 2 + (kind === "ODD" ? 1 : 2);

/** Minimal row shape for the DTO; only semesterNumber matters to these assertions. */
const row = (semesterNumber: number) => ({
  id: "s1",
  programId: "p1",
  name: "Data Structures",
  code: "CS201",
  semesterNumber,
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  program: { degree: { code: "BE" }, branch: { code: "CSE" } },
  _count: {
    facultyAssignments: 0,
    timetableSlots: 0,
    periodAttendance: 0,
    internalMarks: 0,
  },
});

describe("semesterNumber → (year, kind)", () => {
  it("maps the documented example: sem 3 → year 2, ODD", () => {
    const dto = toSubjectDto(row(3));
    expect(dto.year).toBe(2);
    expect(dto.kind).toBe("ODD");
  });

  it.each([
    [1, 1, "ODD"],
    [2, 1, "EVEN"],
    [3, 2, "ODD"],
    [4, 2, "EVEN"],
    [5, 3, "ODD"],
    [6, 3, "EVEN"],
    [7, 4, "ODD"],
    [8, 4, "EVEN"],
  ])("sem %i → year %i, %s", (sem, year, kind) => {
    const dto = toSubjectDto(row(sem));
    expect(dto.year).toBe(year);
    expect(dto.kind).toBe(kind);
  });

  it("odd semesters are always ODD, even always EVEN", () => {
    for (let sem = 1; sem <= 16; sem++) {
      expect(toSubjectDto(row(sem)).kind).toBe(sem % 2 === 1 ? "ODD" : "EVEN");
    }
  });
});

describe("the derivation round-trips", () => {
  it("forward then backward is the identity, up to an 8-year degree", () => {
    for (let year = 1; year <= 8; year++) {
      for (const kind of ["ODD", "EVEN"] as const) {
        const sem = forward(year, kind);
        const dto = toSubjectDto(row(sem));
        expect({ year: dto.year, kind: dto.kind }).toEqual({ year, kind });
      }
    }
  });

  it("matches the CLAUDE.md formula for every semester in range", () => {
    for (let sem = 1; sem <= 16; sem++) {
      const dto = toSubjectDto(row(sem));
      expect(forward(dto.year, dto.kind)).toBe(sem);
    }
  });

  it("covers a 2-year degree as well as a 4-year one", () => {
    // durationYears bounds the range at 2×years; both must derive correctly.
    expect(toSubjectDto(row(4)).year).toBe(2); // last sem of a 2-year degree
    expect(toSubjectDto(row(8)).year).toBe(4); // last sem of a 4-year degree
  });
});

describe("toSubjectDto — dependent count", () => {
  it("sums every dependent relation (drives delete-blocking in the UI)", () => {
    const r = row(1);
    r._count = {
      facultyAssignments: 1,
      timetableSlots: 2,
      periodAttendance: 3,
      internalMarks: 4,
    };
    expect(toSubjectDto(r).dependentCount).toBe(10);
  });

  it("is 0 for a subject nothing references", () => {
    expect(toSubjectDto(row(1)).dependentCount).toBe(0);
  });

  it("builds the program label from degree + branch codes", () => {
    expect(toSubjectDto(row(1)).programLabel).toBe("BE · CSE");
  });
});
