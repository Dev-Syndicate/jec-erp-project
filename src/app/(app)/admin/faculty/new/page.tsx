// /admin/faculty/new — add a staff member (provisioning form only). Super Admin
// / HOD. Auth + shell from the (app) layout.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { NewFacultyView } from "./new-faculty-view";

export default function NewFacultyPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <NewFacultyView />
    </AuthGate>
  );
}
