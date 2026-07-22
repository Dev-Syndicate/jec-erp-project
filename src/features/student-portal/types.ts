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

export type SubjectMarks = {
  subjectId: string;
  code: string;
  name: string;
  items: Array<{ assessment: string; obtained: number; maxMark: number }>;
};

export type StudentOverview = {
  profile: StudentProfile;
  semesterLabel: string | null;
  notEnrolled: boolean;
  attendance: { overall: OverallAttendance | null; subjects: SubjectAttendance[] };
  timetable: PortalSlot[];
  marks: SubjectMarks[];
};
