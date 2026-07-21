// /attendance/day — the class teacher's day-attendance correction view. Gated to
// Super Admin in the UI for now (attendance UI isn't surfaced to Faculty/HOD yet);
// the API is the real boundary and additionally enforces advisor / manage
// ownership (assertOwnsDayRecord).
import { AuthGate } from "@/features/auth/components/auth-gate";
import { DayAttendance } from "@/features/attendance/components/day-attendance";

export default function DayAttendancePage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <DayAttendance />
    </AuthGate>
  );
}
