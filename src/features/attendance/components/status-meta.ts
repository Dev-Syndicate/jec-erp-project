// Shared presentational vocabulary for attendance statuses — fixed (non-brand)
// colors because attendance status encodes meaning, not theme. Reused by the
// period-marking grid and the day-attendance correction view.
import type { AttendanceStatus } from "@/features/attendance/types";

export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; short: string; active: string }
> = {
  PRESENT: { label: "Present", short: "P", active: "border-status-present bg-status-present text-status-present-foreground" },
  ABSENT: { label: "Absent", short: "A", active: "border-status-absent bg-status-absent text-status-absent-foreground" },
  OD: { label: "OD", short: "OD", active: "border-status-od bg-status-od text-status-od-foreground" },
  EXCUSED: { label: "Excused", short: "EX", active: "border-status-excused bg-status-excused text-status-excused-foreground" },
};
