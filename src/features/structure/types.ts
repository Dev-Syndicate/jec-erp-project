// Types owned by the Structure feature (Degree → Branch → Program → Class — the
// admin-configured backbone every other record scopes under). Shared/cross-feature
// DTOs would go in src/types/, but these stay local to the feature.

// Shape returned by GET /api/degrees. `programCount` is the number of Programs
// built on this Degree — it drives the display and the delete guard (a Degree
// with programs can't be hard-deleted, only deactivated).
export type Degree = {
  id: string;
  name: string;
  code: string;
  durationYears: number;
  isActive: boolean;
  programCount: number;
  createdAt: string;
  updatedAt: string;
};

// Body for POST /api/degrees (create) and PATCH /api/degrees/[id] (update; every
// field optional there). The server re-validates regardless — this is the client
// contract, not the source of truth.
export type DegreeInput = {
  name: string;
  code: string;
  durationYears: number;
};

// --- Branch ---------------------------------------------------------------
// A discipline (CSE, ECE, MECH…). Standalone, like Degree minus durationYears.
// `programCount` guards hard-delete (a branch with programs can only deactivate).
export type Branch = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  programCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BranchInput = {
  name: string;
  code: string;
};

// --- Department -----------------------------------------------------------
// The ORGANISATIONAL unit (CSE Department, S&H) — it employs staff, has a HOD,
// owns classes and runs one or more Programs, possibly across several branches.
// Distinct from Branch, which is only the discipline label inside an award.
// The three counts are what it owns; they drive the display and the delete guard.
export type Department = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  programCount: number;
  classCount: number;
  facultyCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DepartmentInput = {
  name: string;
  code: string;
};

// --- Program (Degree × Branch pairing) ------------------------------------
// The scoping key everyone belongs to (e.g. B.E × CSE). It has no name/code of
// its own — it's the pairing. The degree/branch names + codes are denormalised
// into the DTO for display; `durationYears` (from the degree) bounds a Class's
// year. `classCount` guards hard-delete.
export type Program = {
  id: string;
  degreeId: string;
  branchId: string;
  degreeName: string;
  degreeCode: string;
  durationYears: number;
  branchName: string;
  branchCode: string;
  // The department that RUNS this award — not derivable from the branch, since a
  // department may run programs across several branches.
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  isActive: boolean;
  classCount: number;
  createdAt: string;
  updatedAt: string;
};

// The pairing plus the department that runs it are set on create; nothing else is
// editable but isActive.
export type ProgramInput = {
  degreeId: string;
  branchId: string;
  departmentId: string;
};

// --- Class (a group within a Program) -------------------------------------
// year (1..durationYears) + section ("A".."H"), optionally an advisor (the class
// teacher / mentor — active staff in the same program). Unique on (program, year,
// section). `programLabel` is the display string ("B.E · CSE"); `advisorName` is
// the advisor's display name for the table. `studentCount` (placed enrollments)
// guards hard-delete.
export type Class = {
  id: string;
  programId: string;
  programLabel: string;
  // WHO OWNS IT — the scoping key, and not always the program's own department: a
  // first-year class is owned by S&H while its award stays B.E · CSE.
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  year: number;
  section: string;
  advisorId: string | null;
  advisorName: string | null;
  isActive: boolean;
  studentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ClassInput = {
  programId: string;
  // The owning department. Optional — omitted means "the department that runs the
  // program", which is every year-2+ class; supplied hands the class to another
  // department (S&H owning a first year) without touching its award.
  departmentId?: string;
  year: number;
  section: string;
  advisorId?: string | null;
};

// A staff member (faculty / HOD) as an advisor-picker option — re-mapped from the
// shared /api/faculty list. Features must not import each other, so the Structure
// slice keeps its own slim option type instead of reaching into the Faculty slice.
export type StaffOption = {
  userId: string;
  displayName: string;
  // The department that EMPLOYS them — what the advisor picker filters on. Staff
  // carry no award, so there is no program here to filter by.
  departmentId: string;
  departmentCode: string;
  designation: string | null;
};
