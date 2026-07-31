// Types owned by the Marks feature — internal-marks entry for a (class, subject,
// assessment) in the active semester. Kept local (features don't import each
// other).

// IAT 1 and IAT 2 are composites out of 100 (2 cycle tests + 2 assignments + the
// IAT paper); Model is a single mark out of 100. The component breakdown and its
// fixed maximums come FROM THE SERVER (src/app/api/marks/scheme.ts) so the scheme
// is defined in exactly one place.
export type Assessment = "IA1" | "IA2" | "MODEL";

export const ASSESSMENTS: Array<{ value: Assessment; label: string }> = [
  { value: "IA1", label: "IAT 1" },
  { value: "IA2", label: "IAT 2" },
  { value: "MODEL", label: "Model" },
];

// One column of the entry grid.
export type MarkComponent = {
  key: string; // e.g. "IA1_CT1" — matches the stored AssessmentType
  label: string; // "Cycle test 1"
  max: number; // 10, or 60 for the IAT paper
};

// One markable (class, subject) the caller may enter marks for this semester.
export type MarkAssignment = {
  id: string;
  classId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  classLabel: string; // "B.E · CSE · II-A"
  year: number; // drives the Year → Section → Subject drill-down
  section: string;
  programId: string;
  // A HOD/SA may READ any subject in their program but ENTER marks only for one
  // they teach themselves, so the picker flags the view-only entries.
  canEnter: boolean;
};

export type MarkAssignmentsView = {
  semester: { id: string; kind: "ODD" | "EVEN"; academicYear: string } | null;
  assignments: MarkAssignment[];
};

// A single student's row in the entry grid. `marks` is keyed by component key;
// a null means that cell hasn't been entered yet (never stored as 0).
export type MarkRow = {
  studentId: string;
  registerNumber: string;
  rollNumber: string | null;
  displayName: string;
  marks: Record<string, number | null>;
};

export type MarksSheet = {
  classId: string;
  classLabel: string;
  subjectId: string;
  subjectLabel: string; // "CS101 — Data Structures"
  assessment: Assessment;
  components: MarkComponent[]; // the grid's columns, in order
  total: number; // what the whole assessment is out of (always 100)
  academicYear: string;
  // False when viewing a subject you don't teach (a HOD overseeing results) —
  // the grid renders read-only rather than offering a save that would 403.
  canEnter: boolean;
  students: MarkRow[];
};

// The bulk-save payload — one entry per filled CELL (student × component). A
// blank cell is omitted (not stored as 0). Component maximums live on the server.
export type SaveMarksInput = {
  classId: string;
  subjectId: string;
  assessment: Assessment;
  marks: Array<{ studentId: string; component: string; obtained: number }>;
};
