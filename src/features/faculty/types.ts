// Types owned by the faculty feature (staff profile view/edit + list).

export type Gender = "MALE" | "FEMALE" | "OTHER";
export type MaritalStatus = "SINGLE" | "MARRIED" | "OTHER";

// Row in the faculty list.
export type FacultyListItem = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  roles: string[];
  designation: string | null;
  staffId: string | null;
};

// The full staff member the profile page loads.
export type FacultyDetail = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  roles: string[];
  profile: {
    designation: string;
    staffId: string;
    phone: string;
    emergencyPhone: string | null;
    gender: Gender | null;
    dateOfBirth: string | null;
    maritalStatus: MaritalStatus | null;
    fatherName: string | null;
    motherName: string | null;
  } | null;
};

// The profile form's editable values (all strings; "" = empty).
export type FacultyProfileInput = {
  designation: string;
  staffId: string;
  phone: string;
  emergencyPhone: string;
  gender: Gender | "";
  dateOfBirth: string; // ISO yyyy-mm-dd
  maritalStatus: MaritalStatus | "";
  fatherName: string;
  motherName: string;
};
