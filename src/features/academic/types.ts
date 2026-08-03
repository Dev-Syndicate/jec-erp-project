// Types owned by the Academic-time feature — AcademicYear + Semester, the "hub"
// every time-bound record (attendance, marks, timetable) points at. Exactly one
// AcademicYear and one Semester are active at a time (enforced in app, not DB);
// the API's activate endpoints keep that invariant.

export type SemesterKind = "ODD" | "EVEN";

// A session within an academic year. `dependentCount` is the total of every
// time-bound record hanging off it (attendance/marks/timetable/assignments) —
// it guards hard-delete. Dates are ISO strings over the wire.
export type Semester = {
  id: string;
  academicYearId: string;
  kind: SemesterKind;
  startDate: string;
  endDate: string;
  isActive: boolean;
  dependentCount: number;
  createdAt: string;
  updatedAt: string;
};

// One academic year (e.g. "2025-2026") with its (up to two) semesters nested for
// display. `enrollmentCount` + whether it has semesters guard hard-delete.
export type AcademicYear = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  semesters: Semester[];
  enrollmentCount: number;
  createdAt: string;
  updatedAt: string;
};

// Create/update bodies (server re-validates). Dates are ISO yyyy-mm-dd.
export type AcademicYearInput = {
  name: string;
  startDate: string;
  endDate: string;
};

export type SemesterInput = {
  academicYearId: string;
  kind: SemesterKind;
  startDate: string;
  endDate: string;
};

// --- Working Saturdays ----------------------------------------------------
// The college occasionally holds classes on a Saturday, running some weekday's
// timetable. A Super Admin declares each one here (institution-wide); the
// attendance screen then reads it instead of asking each teacher, so everyone
// marking that date sees the same grid. An undeclared Saturday is a holiday.
export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI";

export const WEEKDAY_OPTIONS: Array<{ value: Weekday; label: string }> = [
  { value: "MON", label: "Monday" },
  { value: "TUE", label: "Tuesday" },
  { value: "WED", label: "Wednesday" },
  { value: "THU", label: "Thursday" },
  { value: "FRI", label: "Friday" },
];

export type WorkingDay = {
  id: string;
  date: string; // yyyy-mm-dd (always a Saturday)
  followsDay: Weekday;
  note: string | null;
  declaredBy: string | null;
};

export type WorkingDayInput = {
  date: string;
  followsDay: Weekday;
  note?: string | null;
};
