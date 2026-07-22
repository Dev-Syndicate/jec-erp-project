// /attendance/day — the class teacher's day-attendance correction view. Shown to
// staff (Super Admin / HOD / Faculty); the API is the real boundary and enforces
// advisor / manage ownership (assertOwnsDayRecord), so a Faculty who isn't the
// class advisor gets a clear 403 on a class they don't own.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { DayAttendance } from "@/features/attendance/components/day-attendance";

export default function DayAttendancePage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD", "Faculty"]}>
      <DayAttendance />
    </AuthGate>
  );
}
