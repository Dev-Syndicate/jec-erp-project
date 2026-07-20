// /timetable — Super-Admin-only timetable builder. The (app) layout gives auth +
// shell; here we add the role gate (UX — the API re-checks). Thin page: it mounts
// the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { TimetableManager } from "@/features/timetable/components/timetable-manager";

export default function TimetablePage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <TimetableManager />
    </AuthGate>
  );
}
