// Shared timetable-slot mapping — colocated with the routes (not a route.ts) and
// reused by GET + POST so responses match the client TimetableSlot type.
import "server-only";

export const SLOT_INCLUDE = {
  subject: { select: { code: true, name: true } },
  faculty: { select: { displayName: true } },
} as const;

type SlotRow = {
  id: string;
  dayOfWeek: "MON" | "TUE" | "WED" | "THU" | "FRI";
  period: number;
  subjectId: string;
  facultyId: string;
  subject: { code: string; name: string };
  faculty: { displayName: string };
};

export function toSlotDto(s: SlotRow) {
  return {
    id: s.id,
    dayOfWeek: s.dayOfWeek,
    period: s.period,
    subjectId: s.subjectId,
    subjectCode: s.subject.code,
    subjectName: s.subject.name,
    facultyId: s.facultyId,
    facultyName: s.faculty.displayName,
  };
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
export const roman = (n: number) => ROMAN[n] ?? String(n);

// The curriculum semester a class studies this term (never stored):
// (year-1)*2 + (Odd ? 1 : 2). A year-2 class in an Odd term → semester 3.
export function curriculumSemester(year: number, kind: "ODD" | "EVEN"): number {
  return (year - 1) * 2 + (kind === "ODD" ? 1 : 2);
}
