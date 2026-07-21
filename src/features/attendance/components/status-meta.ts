// Shared presentational vocabulary for attendance statuses — fixed (non-brand)
// colors because attendance status encodes meaning, not theme. Reused by the
// period-marking grid and the day-attendance correction view.
import type { AttendanceStatus } from "@/features/attendance/types";

export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; short: string; active: string }
> = {
  PRESENT: { label: "Present", short: "P", active: "border-emerald-600 bg-emerald-600 text-white" },
  ABSENT: { label: "Absent", short: "A", active: "border-red-600 bg-red-600 text-white" },
  OD: { label: "OD", short: "OD", active: "border-amber-500 bg-amber-500 text-white" },
  EXCUSED: { label: "Excused", short: "EX", active: "border-violet-600 bg-violet-600 text-white" },
};
