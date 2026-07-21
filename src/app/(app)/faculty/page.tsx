// /faculty — faculty management for Super Admin (all programs) and HOD (their own
// program only). The (app) layout gives auth + shell; here we add the role gate
// (UX — the API re-checks every request, scoping HOD to their program). Thin
// page: it mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { FacultyManager } from "@/features/faculty/components/faculty-manager";

export default function FacultyPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <FacultyManager />
    </AuthGate>
  );
}
