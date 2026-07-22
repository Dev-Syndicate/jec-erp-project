// /attendance/timetable — the signed-in staff member's own weekly teaching
// schedule. Open to anyone who marks attendance (Super Admin / HOD / Faculty);
// the API self-scopes to the caller's slots. Thin page: mounts the feature view.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { MyTimetable } from "@/features/attendance/components/my-timetable";

export default function MyTimetablePage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD", "Faculty"]}>
      <MyTimetable />
    </AuthGate>
  );
}
