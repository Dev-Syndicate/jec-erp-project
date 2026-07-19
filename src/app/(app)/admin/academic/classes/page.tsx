// /admin/academic/classes — classes & sections. Super Admin / HOD (HOD scoped to
// own dept by the API). Auth + shell from the (app) layout.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { ClassesView } from "./classes-view";

export default function ClassesPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <ClassesView />
    </AuthGate>
  );
}
