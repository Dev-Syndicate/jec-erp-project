// Shared attendance helpers — colocated with the route (not a route.ts) and used
// by GET (roster view) + POST (save). Attendance is keyed on the actual `date`,
// but the timetable is Mon–Fri: a working Saturday BORROWS a weekday's grid. So
// the "effective weekday" a date runs on is resolved here — Mon–Fri run as
// themselves; a Saturday runs the weekday it `followsDay`; Sunday is off.
import "server-only";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"] as const;
export const roman = (n: number) => ROMAN[n] ?? String(n);

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI";
export const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];

export const STATUSES = ["PRESENT", "ABSENT", "OD", "EXCUSED"] as const;
export type Status = (typeof STATUSES)[number];
export const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status);

// getUTCDay(): 0=Sun … 6=Sat.
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
type DayName = (typeof DOW)[number];

// Parse a "YYYY-MM-DD" string to a UTC-midnight Date — matches Prisma's @db.Date
// storage and keeps the weekday calc timezone-stable.
export function parseDateOnly(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dayName(date: Date): DayName {
  return DOW[date.getUTCDay()];
}

const isFollowsDay = (v: unknown): v is Weekday => WEEKDAYS.includes(v as Weekday);

/**
 * Resolve which weekday's timetable a date runs on.
 * - Mon–Fri → that weekday (any `followsDay` is ignored).
 * - Sat → the weekday it borrows (`followsDay`, required); a working Saturday.
 * - Sun → not a working day.
 */
export function resolveWeekday(
  date: Date,
  followsDay: unknown,
): { weekday: Weekday } | { error: string } {
  const name = dayName(date);
  if (name === "SUN") return { error: "Sunday isn't a working day." };
  if (name === "SAT") {
    if (!isFollowsDay(followsDay)) {
      return { error: "Pick which weekday's timetable this Saturday follows." };
    }
    return { weekday: followsDay };
  }
  return { weekday: name };
}
