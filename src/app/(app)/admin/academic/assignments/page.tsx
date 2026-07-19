// /admin/academic/assignments — teacher assignments for the active term.
// Super Admin / HOD (HOD scoped to own dept by the API). Auth + shell from the
// (app) layout.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AssignmentsView } from "./assignments-view";

export default function AssignmentsPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <AssignmentsView />
    </AuthGate>
  );
}
