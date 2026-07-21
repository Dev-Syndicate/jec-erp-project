// /promotion — Super-Admin-only class promotion / graduation. The (app) layout
// gives auth + shell; here we add the role gate (UX — the API re-checks). Thin
// page: it mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { PromotionManager } from "@/features/promotion/components/promotion-manager";

export default function PromotionPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <PromotionManager />
    </AuthGate>
  );
}
