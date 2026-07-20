// /subjects — Super-Admin-only curriculum management. The (app) layout gives auth
// + shell; here we add the role gate (UX — the API re-checks). Thin page: it
// mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { SubjectManager } from "@/features/subjects/components/subject-manager";

export default function SubjectsPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <SubjectManager />
    </AuthGate>
  );
}
