// Types owned by the Faculty feature. A faculty member is a User (Firebase-linked
// account) + a FacultyProfile detail record (HR fields). Unlike students, they
// log in with their email and have no enrollment; status is simply the login
// status on User (ACTIVE/INACTIVE). Dates are ISO strings over the wire. Kept
// local to the feature — cross-feature imports are not allowed.

export type Gender = "MALE" | "FEMALE" | "OTHER";
export type MaritalStatus = "SINGLE" | "MARRIED" | "OTHER";

// A row in the faculty list / the detail returned after a mutation.
export type Faculty = {
  id: string; // FacultyProfile.id
  userId: string;
  staffId: string;
  designation: string;
  displayName: string; // from the linked User
  email: string;
  phone: string;
  emergencyPhone: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  maritalStatus: MaritalStatus | null;
  fatherName: string | null;
  motherName: string | null;
  status: "ACTIVE" | "INACTIVE"; // = User.status (login enabled?)
  mustChangePassword: boolean; // still on the temp password (never logged in)
  // Who EMPLOYS them — the primary fact, and what the server scopes the list on.
  // The employing department — the ONLY thing that scopes a staff account. There
  // is deliberately no program: a faculty member's award granted nothing (scope,
  // timetable, advisor and cover eligibility all read the department), so the
  // server no longer returns one.
  departmentId: string;
  departmentCode: string; // "CSE", "S&H"
  departmentName: string;
  roles: string[];
  createdAt: string;
  updatedAt: string;
};

// --- Cross-department attachment ------------------------------------------
// A lecturer LENT to another department for the active semester. Employment
// doesn't move — `homeDepartment*` is still where they belong — this only widens
// where they may be timetabled (S&H staff teaching a CSE hour, say).
//
// Semester-bound: attachments lapse at rollover and must be renewed, so a
// one-term loan can't quietly become permanent.
export type Attachment = {
  id: string;
  facultyProfileId: string;
  // The USER id — what the timetable and cover pickers post as the teacher.
  userId: string;
  facultyName: string;
  facultyStatus: "ACTIVE" | "INACTIVE";
  staffId: string;
  designation: string;
  homeDepartmentId: string;
  homeDepartmentCode: string;
  homeDepartmentName: string;
  hostDepartmentId: string;
  hostDepartmentCode: string;
  hostDepartmentName: string;
  assignedByName: string;
  reason: string | null;
  createdAt: string;
};

export type AttachmentInput = {
  facultyProfileId: string;
  departmentId: string; // the HOST department
  reason?: string | null;
};

// An assignable RBAC role (from /api/roles) — configurable data, so the picker
// is driven by this list, not a hardcoded Faculty/HOD toggle.
export type Role = {
  id: string;
  name: string; // "HOD", "Faculty", …
  description: string | null;
  scope: "PROGRAM" | "INSTITUTION";
};

// Body for POST /api/faculty (provision an account). The server generates the
// temp password and forces a reset on first login.
export type FacultyInput = {
  email: string;
  displayName: string;
  departmentId: string; // required — the employing department, and the only scope
  roleIds: string[]; // one or more assignable roles
  staffId: string;
  designation: string;
  phone: string;
  emergencyPhone?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null; // yyyy-mm-dd
  maritalStatus?: MaritalStatus | null;
  fatherName?: string | null;
  motherName?: string | null;
};

// What a successful provision returns — the faculty plus the one-time temp
// password, revealed once for the admin to deliver.
export type ProvisionResult = {
  faculty: Faculty;
  tempPassword: string;
};

// Body for PATCH /api/faculty/[id] — editable detail fields; every one optional.
export type FacultyPatch = {
  displayName?: string;
  // Identity. Send only when actually changed: an email change is a Firebase
  // write (faculty authenticate on it directly) and can 409 if the address is
  // taken; staffId is a unique college id and touches nothing else.
  staffId?: string;
  email?: string;
  designation?: string;
  phone?: string;
  emergencyPhone?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  maritalStatus?: MaritalStatus | null;
  fatherName?: string | null;
  motherName?: string | null;
  status?: "ACTIVE" | "INACTIVE";
  departmentId?: string; // re-employ into a different department (the scoping key)
  roleIds?: string[]; // replace the whole role set (e.g. HOD rotation)
};

// --- Picker options (this feature's own read-only fetch, to honour the
// "features don't import each other" rule) --------------------------------

export type DepartmentOption = {
  id: string;
  name: string; // "Computer Science and Engineering Department"
  code: string; // "CSE", "S&H"
  isActive: boolean;
  // 0 = runs no award (S&H), which is what makes the program field disappear.
  programCount: number;
};
