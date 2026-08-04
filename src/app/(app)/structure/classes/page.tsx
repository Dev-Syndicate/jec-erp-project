// /structure/classes — class management. The (app) layout gives auth + shell; here
// we add the role gate (AuthGate requireRole is UX — the API re-checks every
// request). Page stays thin: it just mounts the feature manager.
//
// HOD is admitted alongside Super Admin because a HOD runs their own department's
// classes — naming the class teacher above all. The API is the real boundary: every
// classes route authorizes on the class's OWNING department, so a HOD sees and
// edits only what their department runs, while Super Admin is unscoped.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { ClassManager } from "@/features/structure/components/class-manager";

export default function ClassesPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <ClassManager />
    </AuthGate>
  );
}
