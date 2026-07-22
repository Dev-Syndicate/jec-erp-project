// Types owned by the Roster feature — the class teacher's view + edit of their
// class's students (active year). They can correct detail fields only; identity,
// status and class placement are read-only here. Kept local (no cross-feature
// imports).

export type Gender = "MALE" | "FEMALE" | "OTHER";
export type StudentStatus = "ACTIVE" | "GRADUATED" | "DROPPED" | "TRANSFERRED";

// Mirrors the subset of the shared student DTO this feature renders (dates arrive
// as ISO strings over JSON).
export type StudentDetail = {
  id: string;
  registerNumber: string;
  rollNumber: string | null;
  displayName: string;
  email: string;
  phone: string;
  gender: Gender | null;
  dateOfBirth: string; // ISO
  status: StudentStatus;
  userStatus: "ACTIVE" | "INACTIVE";
  programLabel: string | null;
  currentEnrollment: { classLabel: string; academicYearName: string } | null;
};

export type ClassRosterView = {
  classId: string;
  classLabel: string; // "B.E · CSE · II-A"
  academicYear: string; // "2026-2027"
  students: StudentDetail[];
};

// The detail fields a class teacher may correct.
export type StudentPatch = {
  displayName?: string;
  rollNumber?: string | null;
  phone?: string;
  gender?: Gender | null;
  dateOfBirth?: string;
};

// This feature's own read-only class list (features don't import each other).
export type ClassOption = {
  id: string;
  label: string; // full: "B.E · CSE · II-A"
  shortLabel: string; // "II-A"
  programId: string;
  programLabel: string; // "B.E · CSE"
  isActive: boolean;
};
