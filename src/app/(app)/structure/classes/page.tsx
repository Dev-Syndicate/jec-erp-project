// /structure/classes — Super-Admin-only class management. The (app) layout gives
// auth + shell; here we add the role gate (AuthGate requireRole is UX — the API
// re-checks every request). Page stays thin: it just mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { ClassManager } from "@/features/structure/components/class-manager";

export default function ClassesPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <ClassManager />
    </AuthGate>
  );
}
