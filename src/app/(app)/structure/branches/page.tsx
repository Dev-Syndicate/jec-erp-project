// /structure/branches — Super-Admin-only branch management. The (app) layout gives
// auth + shell; here we add the role gate (AuthGate requireRole is UX — the API
// re-checks every request). Page stays thin: it just mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { BranchManager } from "@/features/structure/components/branch-manager";

export default function BranchesPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <BranchManager />
    </AuthGate>
  );
}
