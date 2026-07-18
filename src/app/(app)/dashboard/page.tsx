// Protected landing route. Auth + shell come from the (app) group layout, so
// this file is just the content. A placeholder overview until the per-role
// dashboards land (PRD Phase 14).
import { DashboardHome } from "@/features/auth/components/dashboard-home";

export default function DashboardPage() {
  return <DashboardHome />;
}
