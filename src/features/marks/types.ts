// Types owned by the Marks feature — internal-marks entry for a (class, subject,
// assessment) in the active semester. Kept local (features don't import each
// other).

export type Assessment = "IA1" | "IA2" | "MODEL" | "ASSIGNMENT";

export const ASSESSMENTS: Array<{ value: Assessment; label: string }> = [
  { value: "IA1", label: "IA 1" },
  { value: "IA2", label: "IA 2" },
  { value: "MODEL", label: "Model" },
  { value: "ASSIGNMENT", label: "Assignment" },
];

// One markable (class, subject) the caller may enter marks for this semester.
export type MarkAssignment = {
  id: string;
  classId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  classLabel: string; // "B.E · CSE · II-A"
  programId: string;
};

export type MarkAssignmentsView = {
  semester: { id: string; kind: "ODD" | "EVEN"; academicYear: string } | null;
  assignments: MarkAssignment[];
};

// A single student's row in the entry grid — obtained is null until a mark is set.
export type MarkRow = {
  studentId: string;
  registerNumber: string;
  rollNumber: string | null;
  displayName: string;
  obtained: number | null;
};

export type MarksSheet = {
  classId: string;
  classLabel: string;
  subjectId: string;
  subjectLabel: string; // "CS101 — Data Structures"
  assessment: Assessment;
  maxMark: number;
  academicYear: string;
  students: MarkRow[];
};

// The bulk-save payload. A blank cell is omitted (not stored as 0).
export type SaveMarksInput = {
  classId: string;
  subjectId: string;
  assessment: Assessment;
  maxMark: number;
  marks: Array<{ studentId: string; obtained: number }>;
};
