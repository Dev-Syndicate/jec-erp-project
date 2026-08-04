// /structure/departments — Super-Admin-only department management. The (app) layout
// gives auth + shell; here we add the role gate (AuthGate requireRole is UX — the
// API re-checks every request). Page stays thin: it just mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { DepartmentManager } from "@/features/structure/components/department-manager";

export default function DepartmentsPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <DepartmentManager />
    </AuthGate>
  );
}
