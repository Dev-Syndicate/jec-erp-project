// /admin/faculty — provision and manage staff (HOD / Teacher) accounts.
// Super Admin and HOD may reach it (HOD scoped to their own department by the
// API). Auth + shell come from the (app) layout.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { FacultyView } from "./faculty-view";

export default function FacultyPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <FacultyView />
    </AuthGate>
  );
}
