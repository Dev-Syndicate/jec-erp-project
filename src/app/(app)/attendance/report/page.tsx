// /attendance/report — Super-Admin-only attendance report. The (app) layout gives
// auth + shell; here we add the role gate (UX — the API re-checks). Thin page: it
// mounts the feature report view.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AttendanceReport } from "@/features/attendance/components/attendance-report";

export default function AttendanceReportPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <AttendanceReport />
    </AuthGate>
  );
}
