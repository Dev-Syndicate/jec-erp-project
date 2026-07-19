// /admin/academic/subjects — the subject catalog. Super Admin / HOD (HOD scoped
// to own dept by the API). Auth + shell from the (app) layout.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { SubjectsView } from "./subjects-view";

export default function SubjectsPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <SubjectsView />
    </AuthGate>
  );
}
