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
  programId: string | null;
  programLabel: string | null; // "B.E · CSE"
  roles: string[];
  createdAt: string;
  updatedAt: string;
};

// Body for POST /api/faculty (provision an account). The server generates the
// temp password and forces a reset on first login.
export type FacultyInput = {
  email: string;
  displayName: string;
  programId: string;
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
  designation?: string;
  phone?: string;
  emergencyPhone?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  maritalStatus?: MaritalStatus | null;
  fatherName?: string | null;
  motherName?: string | null;
  status?: "ACTIVE" | "INACTIVE";
  programId?: string; // reassign to a different program (the scoping key)
};

// --- Picker options (this feature's own read-only fetch, to honour the
// "features don't import each other" rule) --------------------------------
export type ProgramOption = {
  id: string;
  label: string; // "B.E · CSE"
  durationYears: number;
  isActive: boolean;
};
