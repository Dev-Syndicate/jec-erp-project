// Types owned by the Student portal — the signed-in student's own view of their
// profile, attendance, timetable and marks. All self-scoped server-side (resolved
// from the token, never a client id). Kept local (no cross-feature imports).

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI";

export type StudentProfile = {
  registerNumber: string;
  rollNumber: string | null;
  displayName: string;
  email: string;
  phone: string;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth: string; // ISO
  programLabel: string | null; // "B.E · CSE"
  classLabel: string | null; // "II-A"
};

export type OverallAttendance = {
  present: number;
  absent: number;
  od: number;
  excused: number;
  total: number;
  attended: number;
  pct: number | null;
};

export type SubjectAttendance = {
  subjectId: string;
  code: string;
  name: string;
  attended: number;
  total: number;
  pct: number | null;
};

export type PortalSlot = {
  dayOfWeek: Weekday;
  period: number;
  subjectCode: string;
  subjectName: string;
  facultyName: string;
};

// One stored component of an assessment — a cycle test, an assignment, or the
// IAT exam. `obtained` is null when the teacher hasn't entered it yet, which is
// deliberately distinct from a real 0.
export type MarkComponent = {
  key: string;
  label: string;
  max: number;
  obtained: number | null;
};

// One assessment (IA1, IA2 or Model), out of 100. IA1 and IA2 are COMPOSITES of
// five components; Model is a single mark. The total is summed on read by the
// server, never stored — see src/app/api/marks/scheme.ts, which owns the scheme.
export type SubjectAssessment = {
  key: string;
  max: number;
  obtained: number | null;
  // False while some components are still unmarked, so the UI can say "partial"
  // instead of showing a total that reads as a low score.
  complete: boolean;
  parts: MarkComponent[];
};

export type SubjectMarks = {
  subjectId: string;
  code: string;
  name: string;
  assessments: SubjectAssessment[];
};

// Which weekday's timetable TODAY runs, resolved server-side — the client can't
// work this out from the date, because a working Saturday borrows a weekday's
// grid and only an admin's WorkingDay row says which. `weekday` is null when
// there are no classes at all (Sunday, or a Saturday nobody declared), and
// `followsDay` is set ONLY on a working Saturday, so the UI can name the day
// being borrowed.
export type TodaySchedule = {
  weekday: Weekday | null;
  followsDay: Weekday | null;
};

export type StudentOverview = {
  profile: StudentProfile;
  semesterLabel: string | null;
  notEnrolled: boolean;
  attendance: { overall: OverallAttendance | null; subjects: SubjectAttendance[] };
  timetable: PortalSlot[];
  marks: SubjectMarks[];
  today: TodaySchedule;
};
