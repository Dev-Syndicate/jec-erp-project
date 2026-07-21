// /attendance — Super-Admin-only attendance marking. The (app) layout gives auth +
// shell; here we add the role gate (UX — the API re-checks). Thin page: it mounts
// the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AttendanceManager } from "@/features/attendance/components/attendance-manager";

export default function AttendancePage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <AttendanceManager />
    </AuthGate>
  );
}
