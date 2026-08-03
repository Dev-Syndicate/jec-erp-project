// /academic — Super-Admin-only academic-time setup: years + semesters, and the
// working Saturdays that borrow a weekday's timetable. The (app) layout supplies
// auth + shell; here we add the role gate (UX — the API re-checks every request).
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AcademicManager } from "@/features/academic/components/academic-manager";
import { WorkingDays } from "@/features/academic/components/working-days";

export default function AcademicPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <AcademicManager />
      <div className="px-6 pb-6">
        <WorkingDays />
      </div>
    </AuthGate>
  );
}
