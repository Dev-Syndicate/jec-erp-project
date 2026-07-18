// /admin/students/new — add a student (provisioning form only). Super Admin /
// HOD. Auth + shell from the (app) layout.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { NewStudentView } from "./new-student-view";

export default function NewStudentPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <NewStudentView />
    </AuthGate>
  );
}
