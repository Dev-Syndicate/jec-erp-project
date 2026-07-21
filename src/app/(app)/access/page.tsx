// /access — Super-Admin-only RBAC console (roles + permissions). The (app) layout
// gives auth + shell; here we add the role gate (UX — the API re-checks). Thin
// page: it mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AccessManager } from "@/features/access/components/access-manager";

export default function AccessPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <AccessManager />
    </AuthGate>
  );
}
