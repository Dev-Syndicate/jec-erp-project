// Types owned by the roles feature (user provisioning + role management).
// Shared/cross-feature DTOs go in src/types/.

// Roles this UI can provision. Super Admin is excluded — it's seeded, never
// created through the app (mirrors the /api/users allow-list).
export type ProvisionableRole = "HOD" | "Teacher" | "Student";

export type ProvisionStaffInput = {
  email: string;
  displayName: string;
  role: Extract<ProvisionableRole, "HOD" | "Teacher">;
  departmentId: string;
};

// Students onboard with extra identity fields: registerNumber is the official
// Anna University ID and the LOGIN HANDLE (register + password); rollNumber is
// the college-given handle, optional. The email is still the Firebase identity
// and password-delivery channel.
export type Gender = "MALE" | "FEMALE" | "OTHER";

// Provisioning creates the student ANCHOR (identity + login handle). The full
// admission record is filled in later via the admission wizard.
export type ProvisionStudentInput = {
  email: string;
  displayName: string;
  departmentId: string;
  registerNumber: string; // required — the login handle
  rollNumber?: string; // optional — college-given, may not exist yet
  dateOfBirth: string; // ISO yyyy-mm-dd
  phone: string; // required
  gender?: Gender;
};

// What /api/users returns on success. tempPassword is shown once so the admin
// can relay it until email delivery is wired (see the route's note).
export type ProvisionedUser = {
  id: string;
  // Present only for students — the admission wizard continues from this id.
  studentId: string | null;
  email: string;
  displayName: string;
  role: string;
  departmentId: string | null;
  registerNumber: string | null;
  rollNumber: string | null;
  tempPassword: string;
};

// A minimal department reference the provisioning form needs for its picker.
// Passed in as a prop by the composing page so the roles feature doesn't import
// the departments feature (features must not import each other).
export type DepartmentOption = {
  id: string;
  name: string;
  code: string;
};
