// Protected landing route. A placeholder until the per-role dashboards land
// (PRD Phase 14) — its job now is to be the authenticated destination so the
// login redirect + AuthGate have somewhere real to send people.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { DashboardHome } from "@/features/auth/components/dashboard-home";

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardHome />
    </AuthGate>
  );
}
