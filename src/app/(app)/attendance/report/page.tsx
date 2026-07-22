// /attendance/report — attendance report for staff (Super Admin / HOD / Faculty).
// The (app) layout gives auth + shell; this role gate is UX (the API re-checks and
// scopes a Faculty to the classes they teach/advise). Thin page: it mounts the
// feature report view.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AttendanceReport } from "@/features/attendance/components/attendance-report";

export default function AttendanceReportPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD", "Faculty"]}>
      <AttendanceReport />
    </AuthGate>
  );
}
