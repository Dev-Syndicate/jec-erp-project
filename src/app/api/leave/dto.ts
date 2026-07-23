// Shared leave DTO + helpers — colocated with the routes, reused by the list,
// apply and action handlers so every response matches the client type
// (src/features/leave/types.ts).
import "server-only";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
export const roman = (n: number) => ROMAN[n] ?? String(n);

// A YYYY-MM-DD string -> a UTC midnight Date (same convention as attendance).
export function parseDateOnly(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ISO date (YYYY-MM-DD) of a Date's UTC day.
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Every UTC date from..to inclusive. Bounded to a sane span so a typo can't
 * generate thousands of rows.
 */
export function eachDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(from);
  // Hard cap: 120 days is far more than any real leave/OD.
  for (let i = 0; i < 120 && cur.getTime() <= to.getTime(); i++) {
    out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// Mon..Fri in UTC (0 = Sun, 6 = Sat).
export function isWeekday(d: Date): boolean {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}

type LeaveRow = {
  id: string;
  type: "OD" | "LEAVE";
  fromDate: Date;
  toDate: Date;
  reason: string;
  status: "PENDING_TEACHER" | "PENDING_HOD" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  teacherActionAt: Date | null;
  hodActionAt: Date | null;
  createdAt: Date;
  classId: string;
  class: {
    year: number;
    section: string;
    programId: string;
    advisorId: string | null;
    program: { degree: { code: string }; branch: { code: string } };
  };
  student: { registerNumber: string; rollNumber: string | null; user: { displayName: string } };
  teacherActionBy: { displayName: string } | null;
  hodActionBy: { displayName: string } | null;
};

// `actionable` = may the CURRENT viewer act on THIS request at its CURRENT stage
// (computed per-request in the route, which knows the viewer's relationship to the
// class). Drives whether the UI shows Approve/Reject — so an HOD never sees action
// buttons on a request still awaiting the class teacher.
export function toLeaveDto(l: LeaveRow, actionable = false) {
  return {
    id: l.id,
    type: l.type,
    fromDate: isoDate(l.fromDate),
    toDate: isoDate(l.toDate),
    reason: l.reason,
    status: l.status,
    rejectionReason: l.rejectionReason,
    classId: l.classId,
    classLabel: `${l.class.program.degree.code} · ${l.class.program.branch.code} · ${roman(l.class.year)}-${l.class.section}`,
    student: {
      registerNumber: l.student.registerNumber,
      rollNumber: l.student.rollNumber,
      displayName: l.student.user.displayName,
    },
    teacherActionBy: l.teacherActionBy?.displayName ?? null,
    teacherActionAt: l.teacherActionAt?.toISOString() ?? null,
    hodActionBy: l.hodActionBy?.displayName ?? null,
    hodActionAt: l.hodActionAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    actionable,
  };
}

// The include that produces a LeaveRow. Pass to findMany/findUnique. The class's
// advisorId + programId are needed to decide per-request actionability.
export const LEAVE_INCLUDE = {
  class: { include: { program: { include: { degree: true, branch: true } } } },
  student: { include: { user: { select: { displayName: true } } } },
  teacherActionBy: { select: { displayName: true } },
  hodActionBy: { select: { displayName: true } },
} as const;
