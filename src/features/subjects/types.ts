// Types owned by the Subjects feature — the per-program curriculum catalog. A
// Subject belongs to one curriculum semester (semesterNumber, 1..2×durationYears);
// the class that studies it is derived, not stored (a year-2/Odd class studies
// semesterNumber 3). Kept local to the feature — no cross-feature imports.

// A subject row. `dependentCount` (faculty assignments + timetable slots +
// attendance + marks) guards hard-delete. `year`/`kind` are derived from
// semesterNumber for display only.
export type Subject = {
  id: string;
  programId: string;
  programLabel: string; // "B.E · CSE"
  name: string;
  code: string;
  semesterNumber: number;
  year: number; // ceil(semesterNumber / 2)
  kind: "ODD" | "EVEN"; // odd semesterNumber → ODD
  isActive: boolean;
  dependentCount: number;
  createdAt: string;
  updatedAt: string;
};

// Create/update body (server re-validates; semesterNumber is bounded by the
// program's degree duration).
export type SubjectInput = {
  programId: string;
  name: string;
  code: string;
  semesterNumber: number;
};

// This feature's own read-only program fetch (features don't import each other).
// durationYears bounds the semesterNumber picker (1..2×durationYears). Degree +
// branch are carried separately so the list can be filtered by a Degree → Branch
// cascade rather than one flat program dropdown.
export type ProgramOption = {
  id: string;
  label: string; // "B.E · CSE"
  degreeId: string;
  degreeLabel: string; // "B.E"
  branchId: string;
  branchLabel: string; // "CSE"
  durationYears: number;
  isActive: boolean;
};
