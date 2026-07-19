// Shared DTO mapping for academic years + their semesters. Colocated with the
// routes (not a route.ts, so Next doesn't treat it as an endpoint) and reused by
// the list, item, and activate handlers so every response is shaped identically
// to the client types (src/features/academic/types.ts).

// The Prisma include that produces a semester row with its dependent counts.
export const SEMESTER_INCLUDE = {
  _count: {
    select: {
      facultyAssignments: true,
      timetableSlots: true,
      masterAttendance: true,
      periodAttendance: true,
      internalMarks: true,
    },
  },
} as const;

// The include for a full year row: its semesters (Odd first) + enrollment count.
export const YEAR_INCLUDE = {
  semesters: { include: SEMESTER_INCLUDE, orderBy: { kind: "desc" } },
  _count: { select: { enrollments: true } },
} as const;

type SemesterRow = {
  id: string;
  academicYearId: string;
  kind: "ODD" | "EVEN";
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    facultyAssignments: number;
    timetableSlots: number;
    masterAttendance: number;
    periodAttendance: number;
    internalMarks: number;
  };
};

type YearRow = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  semesters: SemesterRow[];
  _count: { enrollments: number };
};

export function toSemesterDto(s: SemesterRow) {
  const dependentCount =
    s._count.facultyAssignments +
    s._count.timetableSlots +
    s._count.masterAttendance +
    s._count.periodAttendance +
    s._count.internalMarks;
  return {
    id: s.id,
    academicYearId: s.academicYearId,
    kind: s.kind,
    startDate: s.startDate,
    endDate: s.endDate,
    isActive: s.isActive,
    dependentCount,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export function toYearDto(y: YearRow) {
  return {
    id: y.id,
    name: y.name,
    startDate: y.startDate,
    endDate: y.endDate,
    isActive: y.isActive,
    semesters: y.semesters.map(toSemesterDto),
    enrollmentCount: y._count.enrollments,
    createdAt: y.createdAt,
    updatedAt: y.updatedAt,
  };
}
