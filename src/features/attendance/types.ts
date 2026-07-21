// Types owned by the Attendance feature — mark a class's attendance for one
// (date, period). The marking unit is a single period: pick class + date, the
// weekday resolves (a Saturday borrows a weekday's grid via `followsDay`), then
// mark the roster for a scheduled period. Period 1 also sets the day's official
// MasterAttendance (handled server-side). Kept local — no cross-feature imports.

export type AttendanceStatus = "PRESENT" | "ABSENT" | "OD" | "EXCUSED";
export const STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "OD", "EXCUSED"];

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI";
export const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];

// A student on the class's active-year roster.
export type RosterStudent = {
  studentId: string;
  registerNumber: string;
  rollNumber: string | null;
  displayName: string;
};

// One scheduled period of the day (from the timetable for the effective weekday).
export type DayPeriod = {
  period: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  facultyId: string;
  facultyName: string;
};

// A mark already saved for this date (used to prefill the grid).
export type ExistingMark = { studentId: string; period: number; status: AttendanceStatus };

// The whole marking context for one (class, date).
export type RosterView = {
  classId: string;
  classLabel: string; // "B.E · CSE · II-A"
  date: string; // YYYY-MM-DD
  weekday: Weekday; // resolved (Sat → the borrowed weekday)
  semesterId: string;
  semesterLabel: string; // "2025-2026 · Odd"
  periods: DayPeriod[];
  roster: RosterStudent[];
  marks: ExistingMark[];
};

// Body for POST /api/attendance — save one period's marks.
export type MarkInput = {
  classId: string;
  date: string;
  period: number;
  followsDay?: Weekday; // required when the date is a Saturday
  entries: Array<{ studentId: string; status: AttendanceStatus }>;
};

export type SaveResult = { saved: number; setDayAttendance: boolean };

// This feature's own read-only class fetch (features don't import each other).
export type ClassOption = {
  id: string;
  label: string; // full: "B.E · CSE · II-A"
  shortLabel: string; // within a program: "II-A"
  programId: string;
  programLabel: string; // "B.E · CSE"
  isActive: boolean;
};

// --- Day attendance (class-teacher correction) ----------------------------
// The official DAY (Master) record for a class on a date. Auto-seeded from period
// 1, but the class teacher can correct it here — a corrected row is
// `manuallyAdjusted` and the period-1 seed won't overwrite it.
export type DayStudent = {
  studentId: string;
  registerNumber: string;
  rollNumber: string | null;
  displayName: string;
  status: AttendanceStatus | null; // null = no day record yet
  manuallyAdjusted: boolean;
};

export type DayView = {
  classId: string;
  classLabel: string;
  date: string; // YYYY-MM-DD
  roster: DayStudent[];
};

// Body for POST /api/attendance/master — correct the day record.
export type DayInput = {
  classId: string;
  date: string;
  entries: Array<{ studentId: string; status: AttendanceStatus }>;
};

// --- Reports --------------------------------------------------------------
// The attendance percentages for a class in the active semester. `pct` is null
// when nothing has been marked yet (no denominator). PRESENT + OD = attended.
export type SubjectMeta = { subjectId: string; code: string; name: string };

export type SubjectStat = {
  subjectId: string;
  attended: number;
  total: number;
  pct: number | null;
};

export type StudentReport = {
  studentId: string;
  registerNumber: string;
  displayName: string;
  overall: {
    present: number;
    absent: number;
    od: number;
    excused: number;
    total: number;
    attended: number;
    pct: number | null;
  };
  subjects: SubjectStat[]; // aligned with subjectsMeta order
};

export type AttendanceReport = {
  classId: string;
  classLabel: string;
  semesterLabel: string;
  subjectsMeta: SubjectMeta[];
  students: StudentReport[];
};
