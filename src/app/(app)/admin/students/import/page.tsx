// /admin/students/import — bulk-import students from CSV/Excel. Super Admin / HOD.
// Auth + shell from the (app) layout; the API re-checks role + dept scope.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { ImportStudentsView } from "./import-view";

export default function ImportStudentsPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <ImportStudentsView />
    </AuthGate>
  );
}
