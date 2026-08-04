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

// Who is covering a period on this date, when its usual teacher is away.
export type PeriodCover = {
  facultyId: string;
  facultyName: string;
  reason: string | null;
};

// One scheduled period of the day (from the timetable for the effective weekday).
export type DayPeriod = {
  period: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  facultyId: string;
  facultyName: string;
  // Whether the current viewer may mark this period (server-computed: they are
  // this period's teacher, or a substitute assigned to cover it on this date —
  // no role grants it). The UI locks the rest.
  canMark: boolean;
  // Set when someone is covering this hour today, so the grid can name who is
  // taking it rather than showing only the absent teacher.
  coveredBy: PeriodCover | null;
};

// A mark already saved for this date (used to prefill the grid).
export type ExistingMark = { studentId: string; period: number; status: AttendanceStatus };

// The whole marking context for one (class, date).
export type RosterView = {
  classId: string;
  classLabel: string; // "B.E · CSE · II-A"
  date: string; // YYYY-MM-DD
  weekday: Weekday; // resolved (Sat → the borrowed weekday)
  // Set only on a declared working Saturday — the weekday an admin said it
  // runs. The UI states it read-only; nobody picks it here.
  followsDay?: Weekday;
  semesterId: string;
  semesterLabel: string; // "2025-2026 · Odd"
  periods: DayPeriod[];
  roster: RosterStudent[];
  marks: ExistingMark[];
};

// Body for POST /api/attendance — save one period's marks. Saturdays need
// nothing extra: the server resolves the working-day declaration itself.
export type MarkInput = {
  classId: string;
  date: string;
  period: number;
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

// --- My timetable ---------------------------------------------------------
// The signed-in staff member's own weekly teaching schedule for the active
// semester — one entry per period they're the assigned faculty for.
export type MyTimetableSlot = {
  dayOfWeek: Weekday;
  period: number;
  subjectCode: string;
  subjectName: string;
  classId: string;
  classLabel: string; // full: "B.E · CSE · II-A"
  classShort: string; // "II-A"
};

export type MyTimetable = {
  semesterLabel: string | null; // null when no semester is active
  slots: MyTimetableSlot[];
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

// --- Substitutions (cover) ---------------------------------------------------
// Arranging cover for a period whose usual teacher is away. A substitution is a
// DATED grant: it lets the covering teacher mark that one hour on that one date,
// and leaves the permanent timetable alone. Assigned by HOD / Super Admin only.

// The cover arranged for one period, as the assigner sees it.
export type Substitution = {
  id: string;
  substituteId: string;
  substituteName: string;
  assignedByName: string;
  reason: string | null;
};

// One period of the day on the cover screen: who normally takes it, and who (if
// anyone) is covering.
export type CoverPeriod = {
  slotId: string;
  period: number;
  subjectCode: string;
  subjectName: string;
  classId: string;
  classShort: string;
  regularFacultyId: string;
  regularFacultyName: string;
  substitution: Substitution | null;
};

export type CoverView = {
  classId: string;
  // The department that OWNS this class. The covering teacher must be staff of
  // it (the API refuses anyone else), and staff carry no award — so this, not
  // the class's program, is what the cover picker filters on.
  departmentId: string;
  date: string;
  weekday: Weekday;
  followsDay?: Weekday;
  periods: CoverPeriod[];
};

// Body for POST /api/attendance/substitutions — assign (or reassign) cover.
export type AssignCoverInput = {
  slotId: string;
  date: string;
  substituteId: string;
  reason?: string;
};
