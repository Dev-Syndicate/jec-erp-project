// /structure/degrees — Super-Admin-only degree management. The (app) layout gives
// auth + shell; here we add the role gate (AuthGate requireRole is UX — the API
// re-checks every request). Page stays thin: it just mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { DegreeManager } from "@/features/structure/components/degree-manager";

export default function DegreesPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <DegreeManager />
    </AuthGate>
  );
}
