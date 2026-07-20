// Shared faculty DTO mapping — colocated with the routes (not a route.ts) and
// reused by the list + mutation handlers so every response matches the client
// type (src/features/faculty/types.ts). A faculty member is a Firebase-linked
// User + a FacultyProfile (HR detail); status lives on User (there is no
// separate lifecycle field like Student has).
import "server-only";

// The include that produces a faculty row with its user, program and roles.
// Pass to findMany/findUnique.
export const FACULTY_INCLUDE = {
  user: {
    include: {
      program: { include: { degree: true, branch: true } },
      roles: { include: { role: true } },
    },
  },
} as const;

type Deg = { code: string };
type Br = { code: string };
type ProgRel = { degree: Deg; branch: Br } | null;

type FacultyRow = {
  id: string;
  userId: string;
  staffId: string;
  designation: string;
  phone: string;
  emergencyPhone: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth: Date | null;
  maritalStatus: "SINGLE" | "MARRIED" | "OTHER" | null;
  fatherName: string | null;
  motherName: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    email: string;
    displayName: string;
    status: "ACTIVE" | "INACTIVE";
    mustChangePassword: boolean;
    programId: string | null;
    program: ProgRel;
    roles: Array<{ role: { name: string } }>;
  };
};

function programLabel(p: ProgRel): string | null {
  return p ? `${p.degree.code} · ${p.branch.code}` : null;
}

export function toFacultyDto(f: FacultyRow) {
  return {
    id: f.id,
    userId: f.userId,
    staffId: f.staffId,
    designation: f.designation,
    displayName: f.user.displayName,
    email: f.user.email,
    phone: f.phone,
    emergencyPhone: f.emergencyPhone,
    gender: f.gender,
    dateOfBirth: f.dateOfBirth,
    maritalStatus: f.maritalStatus,
    fatherName: f.fatherName,
    motherName: f.motherName,
    status: f.user.status,
    mustChangePassword: f.user.mustChangePassword,
    programId: f.user.programId,
    programLabel: programLabel(f.user.program),
    roles: f.user.roles.map((r) => r.role.name),
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}
