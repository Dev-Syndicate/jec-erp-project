// /students — student management for Super Admin (all programs) and HOD (their
// own program only). The (app) layout gives auth + shell; here we add the role
// gate (UX — the API re-checks every request, scoping HOD to their program). Thin
// page: it mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { StudentManager } from "@/features/students/components/student-manager";

export default function StudentsPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <StudentManager />
    </AuthGate>
  );
}
