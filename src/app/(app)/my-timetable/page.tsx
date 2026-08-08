// /my-timetable — the signed-in student's own weekly timetable. The Overview
// keeps the today strip; the full week lives here so it's a deliberate visit
// rather than a long grid at the bottom of the dashboard.
//
// Student-only on purpose: staff have their own teaching schedule at
// /attendance/timetable. The role gate is UX — GET /api/me/overview self-scopes
// to the caller either way.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { StudentTimetable } from "@/features/student-portal/components/student-timetable";

export default function MyTimetablePage() {
  return (
    <AuthGate requireRole={["Student"]}>
      <StudentTimetable />
    </AuthGate>
  );
}
