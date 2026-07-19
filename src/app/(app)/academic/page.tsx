// /academic — Super-Admin-only academic-time setup (years + semesters). The (app)
// layout supplies auth + shell; here we add the role gate (UX — the API re-checks
// every request). Thin page: it just mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AcademicManager } from "@/features/academic/components/academic-manager";

export default function AcademicPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <AcademicManager />
    </AuthGate>
  );
}
