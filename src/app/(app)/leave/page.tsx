// /leave — OD/leave apply (students) + approval queue (class teacher, HOD). The
// page is role-aware: the API tells the UI whether the caller is a student or an
// approver, so one route serves both. Gate is broad; the API enforces the real
// rules (apply vs approve, per-class scope, two-stage workflow).
import { AuthGate } from "@/features/auth/components/auth-gate";
import { LeaveManager } from "@/features/leave/components/leave-manager";

export default function LeavePage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD", "Faculty", "Student"]}>
      <LeaveManager />
    </AuthGate>
  );
}
