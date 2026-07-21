// Types owned by the Students feature. A student is a User (Firebase-linked
// account) + a Student detail record; their placement in a class for a given
// year is an Enrollment (the "yearly sticker"). Dates are ISO strings over the
// wire. Kept local to the feature — cross-feature imports are not allowed.

export type Gender = "MALE" | "FEMALE" | "OTHER";
export type StudentStatus = "ACTIVE" | "GRADUATED" | "DROPPED" | "TRANSFERRED";

// The student's placement for the active academic year (null if not enrolled).
export type StudentEnrollment = {
  id: string;
  classId: string;
  classLabel: string; // "B.E · CSE · II-A"
  year: number;
  section: string;
  academicYearId: string;
  academicYearName: string;
};

// A row in the students list / the detail returned after a mutation.
export type Student = {
  id: string; // Student.id
  userId: string;
  registerNumber: string;
  rollNumber: string | null;
  displayName: string; // from the linked User
  email: string;
  phone: string;
  gender: Gender | null;
  dateOfBirth: string;
  status: StudentStatus; // Student lifecycle
  userStatus: "ACTIVE" | "INACTIVE"; // login enabled?
  mustChangePassword: boolean; // still on the temp password (never logged in)
  programId: string | null;
  programLabel: string | null; // "B.E · CSE"
  currentEnrollment: StudentEnrollment | null;
  createdAt: string;
  updatedAt: string;
};

// Body for POST /api/students (provision an account). The server generates the
// temp password and forces a reset on first login.
export type StudentInput = {
  email: string;
  displayName: string;
  programId: string;
  classId?: string; // optional: place in this class for the active year on create
  registerNumber: string;
  rollNumber?: string | null;
  dateOfBirth: string; // yyyy-mm-dd
  phone: string;
  gender?: Gender | null;
};

// What a successful provision returns — the student plus the one-time temp
// password, revealed once for the admin to deliver.
export type ProvisionResult = {
  student: Student;
  tempPassword: string;
};

// Body for PATCH /api/students/[id] — editable detail fields; every one optional.
export type StudentPatch = {
  displayName?: string;
  rollNumber?: string | null;
  phone?: string;
  gender?: Gender | null;
  dateOfBirth?: string;
  status?: StudentStatus;
  classId?: string; // move to this class for the active year (edited inline)
};

// --- Picker options (this feature's own read-only fetches, to honour the
// "features don't import each other" rule) --------------------------------
export type ProgramOption = {
  id: string;
  label: string; // "B.E · CSE"
  durationYears: number;
  isActive: boolean;
};

export type ClassOption = {
  id: string;
  programId: string;
  label: string; // "B.E · CSE · II-A"
  year: number; // 1..durationYears — the first level of the enrol cascade
  section: string; // "A".."H" — the second level
  isActive: boolean;
};

// --- Bulk import ----------------------------------------------------------
// A row rejected during parse/validation (bad email, missing field, in-file dupe).
export type ImportRowError = {
  rowNumber: number;
  registerNumber: string;
  reason: string;
};

// A structurally-valid parsed row shown in the preview before committing.
export type ImportParsedRow = {
  rowNumber: number;
  name: string;
  email: string;
  registerNumber: string;
  rollNumber: string;
  dateOfBirth: string;
  phone: string;
  gender: "MALE" | "FEMALE" | "OTHER" | "";
};

// The dry-run response: what would be imported, and what's already invalid.
export type ImportPreview = {
  rows: ImportParsedRow[];
  errors: ImportRowError[];
  tooManyRows: boolean;
};

// The outcome of provisioning one row (mirrors lib/student-import ImportOutcome).
export type ImportOutcome = {
  rowNumber: number;
  registerNumber: string;
  rollNumber: string;
  name: string;
  email: string;
  status: "created" | "skipped" | "error";
  reason?: string;
  studentId?: string;
  tempPassword?: string; // only on created rows — shown once, exportable
};

// The commit response: per-row provision outcomes + rows that never parsed.
export type ImportResult = {
  outcomes: ImportOutcome[];
  parseErrors: ImportRowError[];
  tooManyRows: boolean;
};
