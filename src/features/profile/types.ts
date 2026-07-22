// Types owned by the profile feature — the signed-in user's own full detail,
// as returned by GET /api/profile.

export type ProfileProgram = {
  degreeCode: string;
  degreeName: string;
  branchCode: string;
  branchName: string;
};

export type ProfileFaculty = {
  staffId: string;
  designation: string;
  phone: string;
  emergencyPhone: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth: string | null; // ISO
  maritalStatus: "SINGLE" | "MARRIED" | "OTHER" | null;
  fatherName: string | null;
  motherName: string | null;
};

export type ProfileStudent = {
  registerNumber: string;
  rollNumber: string | null;
  dateOfBirth: string; // ISO
  phone: string;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
};

export type Profile = {
  id: string;
  email: string;
  displayName: string;
  status: "ACTIVE" | "INACTIVE";
  roles: string[];
  program: ProfileProgram | null;
  faculty: ProfileFaculty | null;
  student: ProfileStudent | null;
};
