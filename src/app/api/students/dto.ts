// Shared student DTO mapping — colocated with the routes (not a route.ts) and
// reused by the list + mutation handlers so every response matches the client
// type (src/features/students/types.ts). Enrollment is filtered to the active
// academic year (the placement attendance reads from).
import "server-only";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"] as const;
function roman(n: number): string {
  return ROMAN[n] ?? String(n);
}

// The include that produces a student row with its user, program and the
// active-year enrollment. Pass to findMany/findUnique.
export const STUDENT_INCLUDE = {
  user: {
    include: { program: { include: { degree: true, branch: true } } },
  },
  enrollments: {
    where: { academicYear: { isActive: true } },
    include: {
      class: { include: { program: { include: { degree: true, branch: true } } } },
      academicYear: true,
    },
    take: 1,
  },
} as const;

type Deg = { code: string };
type Br = { code: string };
type ProgRel = { degree: Deg; branch: Br } | null;

type StudentRow = {
  id: string;
  registerNumber: string;
  rollNumber: string | null;
  phone: string;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth: Date;
  status: "ACTIVE" | "GRADUATED" | "DROPPED" | "TRANSFERRED";
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    displayName: string;
    status: "ACTIVE" | "INACTIVE";
    mustChangePassword: boolean;
    programId: string | null;
    program: ProgRel;
  };
  enrollments: Array<{
    id: string;
    classId: string;
    academicYearId: string;
    class: { year: number; section: string; program: { degree: Deg; branch: Br } };
    academicYear: { name: string };
  }>;
};

function programLabel(p: ProgRel): string | null {
  return p ? `${p.degree.code} · ${p.branch.code}` : null;
}

export function toStudentDto(s: StudentRow) {
  const e = s.enrollments[0];
  return {
    id: s.id,
    userId: s.user.id,
    registerNumber: s.registerNumber,
    rollNumber: s.rollNumber,
    displayName: s.user.displayName,
    email: s.user.email,
    phone: s.phone,
    gender: s.gender,
    dateOfBirth: s.dateOfBirth,
    status: s.status,
    userStatus: s.user.status,
    mustChangePassword: s.user.mustChangePassword,
    programId: s.user.programId,
    programLabel: programLabel(s.user.program),
    currentEnrollment: e
      ? {
          id: e.id,
          classId: e.classId,
          classLabel: `${e.class.program.degree.code} · ${e.class.program.branch.code} · ${roman(e.class.year)}-${e.class.section}`,
          year: e.class.year,
          section: e.class.section,
          academicYearId: e.academicYearId,
          academicYearName: e.academicYear.name,
        }
      : null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
