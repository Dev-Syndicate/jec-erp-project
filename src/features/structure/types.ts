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
  isActive: boolean;
  classCount: number;
  createdAt: string;
  updatedAt: string;
};

// Only the pairing is set on create; nothing else is editable but isActive.
export type ProgramInput = {
  degreeId: string;
  branchId: string;
};

// --- Class (a group within a Program) -------------------------------------
// year (1..durationYears) + section ("A".."H"), optionally an advisor. Unique on
// (program, year, section). `programLabel` is the display string ("B.E · CSE").
// `studentCount` (placed enrollments) guards hard-delete. Advisor picker is
// deferred until the People slice exposes a staff-listing endpoint.
export type Class = {
  id: string;
  programId: string;
  programLabel: string;
  year: number;
  section: string;
  advisorId: string | null;
  isActive: boolean;
  studentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ClassInput = {
  programId: string;
  year: number;
  section: string;
  advisorId?: string | null;
};
