// /admin/students — provision and manage student accounts. Super Admin and HOD
// (HOD scoped to their own department by the API). Auth + shell from the (app)
// layout.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { StudentsView } from "./students-view";

export default function StudentsPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <StudentsView />
    </AuthGate>
  );
}
