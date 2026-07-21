// Shared Class DTO mapping + validation — colocated with the class routes and
// reused by the list/create/update handlers so every response matches the client
// type (src/features/structure/types.ts → Class). A Class is a group within a
// Program (year + section); its optional advisor is the class teacher / mentor
// who owns the day (Master) attendance record.
import "server-only";

import { db } from "@/lib/db";

// Include shape shared by list + create + update, so the DTO is built the same
// way everywhere (program → degree/branch codes for the label; enrollment count
// for the student total + delete guard; advisor name for display).
export const CLASS_INCLUDE = {
  program: { include: { degree: true, branch: true } },
  advisor: { select: { displayName: true } },
  _count: { select: { enrollments: true } },
} as const;

type ClassRow = {
  id: string;
  programId: string;
  program: { degree: { code: string }; branch: { code: string } };
  year: number;
  section: string;
  advisorId: string | null;
  advisor: { displayName: string } | null;
  isActive: boolean;
  _count: { enrollments: number };
  createdAt: Date;
  updatedAt: Date;
};

export function toClassDto(c: ClassRow) {
  return {
    id: c.id,
    programId: c.programId,
    programLabel: `${c.program.degree.code} · ${c.program.branch.code}`,
    year: c.year,
    section: c.section,
    advisorId: c.advisorId,
    advisorName: c.advisor?.displayName ?? null,
    isActive: c.isActive,
    studentCount: c._count.enrollments,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/**
 * Validate a class advisor (class teacher) selection. The advisor is optional —
 * null/undefined clears it. If set, it must be an ACTIVE staff user (has a
 * FacultyProfile) IN THE SAME PROGRAM as the class: the class teacher belongs to
 * the program they advise. Returns the resolved id (or null) on success.
 */
export async function validateAdvisor(
  advisorId: string | null | undefined,
  programId: string,
): Promise<{ ok: string | null } | { error: string }> {
  if (advisorId == null || advisorId === "") return { ok: null };

  const user = await db.user.findUnique({
    where: { id: advisorId },
    select: { status: true, programId: true, facultyProfile: { select: { id: true } } },
  });
  if (!user || !user.facultyProfile) return { error: "Select a valid staff member as advisor." };
  if (user.status !== "ACTIVE") return { error: "That staff member is inactive." };
  if (user.programId !== programId) {
    return { error: "The advisor must belong to this class's program." };
  }
  return { ok: advisorId };
}
