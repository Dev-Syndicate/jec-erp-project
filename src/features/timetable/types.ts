// Types owned by the Timetable feature — the Mon–Fri weekly grid that places a
// subject + faculty into each (day, period) for a class, in the active semester.
// One slot per (class, semester, day, period). Kept local — no cross-feature
// imports; the feature fetches classes/subjects/faculty for its pickers itself.

export type DayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI";
export const DAYS: DayOfWeek[] = ["MON", "TUE", "WED", "THU", "FRI"];
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

// One filled cell of the grid.
export type TimetableSlot = {
  id: string;
  dayOfWeek: DayOfWeek;
  period: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  facultyId: string; // = User.id
  facultyName: string;
};

// The whole grid for one class in the active semester, plus the context the UI
// needs to filter the subject picker (curriculumSemesterNumber) and label things.
export type TimetableView = {
  classId: string;
  classLabel: string; // "B.E · CSE · II-A"
  semesterId: string;
  semesterLabel: string; // "2025-2026 · Odd"
  curriculumSemesterNumber: number; // (year-1)*2 + (Odd?1:2) — which subjects apply
  slots: TimetableSlot[];
};

// Body for POST /api/timetable — upsert one cell (active semester implied).
export type SlotInput = {
  classId: string;
  dayOfWeek: DayOfWeek;
  period: number;
  subjectId: string;
  facultyId: string;
};

// --- Picker options (this feature's own read-only fetches) ----------------
export type ClassOption = {
  id: string;
  label: string; // full: "B.E · CSE · II-A"
  shortLabel: string; // within a program: "II-A"
  programId: string;
  programLabel: string; // "B.E · CSE" — for the program picker
  isActive: boolean;
};

export type SubjectOption = {
  id: string;
  code: string;
  name: string;
  programId: string;
  semesterNumber: number;
  isActive: boolean;
};

export type FacultyOption = {
  id: string; // = User.id (what a slot's facultyId references)
  name: string;
  programId: string | null;
  status: "ACTIVE" | "INACTIVE";
};
