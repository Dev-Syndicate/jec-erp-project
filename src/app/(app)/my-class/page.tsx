// /my-class — the class teacher's roster management for the class they advise.
// The role gate is UX (the API re-checks advisor ownership); the nav only surfaces
// this to a class teacher. Thin page: it mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { ClassRoster } from "@/features/roster/components/class-roster";

export default function MyClassPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD", "Faculty"]}>
      <ClassRoster />
    </AuthGate>
  );
}
