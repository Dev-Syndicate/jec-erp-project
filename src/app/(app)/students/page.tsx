// /students — Super-Admin-only student management. The (app) layout gives auth +
// shell; here we add the role gate (UX — the API re-checks every request). Thin
// page: it mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { StudentManager } from "@/features/students/components/student-manager";

export default function StudentsPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <StudentManager />
    </AuthGate>
  );
}
