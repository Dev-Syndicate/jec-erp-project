// Layout for every authenticated page: gate on auth, then render inside the app
// shell (brand rail + context bar). Individual pages stay thin — they provide
// content only. Role-gating for specific pages (e.g. /admin → Super Admin) is
// layered on in the page itself via AuthGate's requireRole.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AppShell } from "./app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
