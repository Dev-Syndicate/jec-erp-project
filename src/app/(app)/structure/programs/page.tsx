// /structure/programs — Super-Admin-only program management. The (app) layout gives
// auth + shell; here we add the role gate (AuthGate requireRole is UX — the API
// re-checks every request). Page stays thin: it just mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { ProgramManager } from "@/features/structure/components/program-manager";

export default function ProgramsPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <ProgramManager />
    </AuthGate>
  );
}
