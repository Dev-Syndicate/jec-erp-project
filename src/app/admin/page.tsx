// /admin — the Super Admin console. Thin route file: gate on auth + the Super
// Admin role, then hand off to the composition component. The API re-enforces
// Super Admin on every write regardless of this client-side gate.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AdminConsole } from "./admin-console";

export default function AdminPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <AdminConsole />
    </AuthGate>
  );
}
