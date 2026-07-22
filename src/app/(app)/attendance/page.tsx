// /attendance — attendance marking, for staff who mark attendance (Super Admin /
// HOD / Faculty). The (app) layout gives auth + shell; this role gate is UX (the
// API re-checks and scopes to the class the faculty teaches). Thin page: it mounts
// the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AttendanceManager } from "@/features/attendance/components/attendance-manager";

export default function AttendancePage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD", "Faculty"]}>
      <AttendanceManager />
    </AuthGate>
  );
}
