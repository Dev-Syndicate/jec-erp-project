// /subjects — curriculum management for Super Admin (all programs) and HOD (their
// own program only). The (app) layout gives auth + shell; here we add the role
// gate (UX — the API re-checks, scoping HOD to their program). Thin page: it
// mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { SubjectManager } from "@/features/subjects/components/subject-manager";

export default function SubjectsPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <SubjectManager />
    </AuthGate>
  );
}
