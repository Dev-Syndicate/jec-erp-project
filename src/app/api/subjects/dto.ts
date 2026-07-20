// Shared Subject DTO mapping — colocated with the routes (not a route.ts) and
// reused by the list + mutation handlers so every response matches the client
// type (src/features/subjects/types.ts). year + kind are DERIVED from
// semesterNumber (never stored): sem 3 → year 2, Odd.
import "server-only";

export const SUBJECT_INCLUDE = {
  program: { include: { degree: true, branch: true } },
  _count: {
    select: {
      facultyAssignments: true,
      timetableSlots: true,
      periodAttendance: true,
      internalMarks: true,
    },
  },
} as const;

type SubjectRow = {
  id: string;
  programId: string;
  name: string;
  code: string;
  semesterNumber: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  program: { degree: { code: string }; branch: { code: string } };
  _count: {
    facultyAssignments: number;
    timetableSlots: number;
    periodAttendance: number;
    internalMarks: number;
  };
};

export function toSubjectDto(s: SubjectRow) {
  const dependentCount =
    s._count.facultyAssignments +
    s._count.timetableSlots +
    s._count.periodAttendance +
    s._count.internalMarks;
  return {
    id: s.id,
    programId: s.programId,
    programLabel: `${s.program.degree.code} · ${s.program.branch.code}`,
    name: s.name,
    code: s.code,
    semesterNumber: s.semesterNumber,
    year: Math.ceil(s.semesterNumber / 2),
    kind: s.semesterNumber % 2 === 1 ? ("ODD" as const) : ("EVEN" as const),
    isActive: s.isActive,
    dependentCount,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
