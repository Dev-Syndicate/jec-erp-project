// /marks — internal marks entry for the subjects the caller teaches this semester.
// The role gate is UX (the API re-checks the FacultyAssignment per request); the
// nav only surfaces this to staff who enter marks. Thin page: mounts the manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { MarksEntry } from "@/features/marks/components/marks-entry";

export default function MarksPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD", "Faculty"]}>
      <MarksEntry />
    </AuthGate>
  );
}
