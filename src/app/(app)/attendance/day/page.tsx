// /attendance/day — the class teacher's day-attendance correction view. Shown to
// staff (Super Admin / HOD / Faculty); the API is the real boundary and enforces
// advisor / manage ownership (assertOwnsDayRecord), so a Faculty who isn't the
// class advisor gets a clear 403 on a class they don't own.
//
// Super Admin is in the gate but NOT in the nav (see nav-config.ts): correcting a
// day record is the class teacher's job, so the rail stops offering it — while
// the URL stays reachable as the override valve for a class whose advisor is
// unset or unavailable. This is the same nav-hides / URL-open split every
// sibling attendance route uses; test/app/nav-config.test.ts pins it.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { DayAttendance } from "@/features/attendance/components/day-attendance";

export default function DayAttendancePage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD", "Faculty"]}>
      <DayAttendance />
    </AuthGate>
  );
}
