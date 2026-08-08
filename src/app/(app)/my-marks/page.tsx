// /my-marks — the signed-in student's own internal marks.
//
// Student-only on purpose, and a separate route from /marks: that page is the
// staff ENTRY screen (a teacher picking a subject they teach and typing marks
// in), which is a different job from a student reading their own. The role gate
// is UX — GET /api/me/overview self-scopes to the caller either way.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { StudentMarks } from "@/features/student-portal/components/student-marks";

export default function MyMarksPage() {
  return (
    <AuthGate requireRole={["Student"]}>
      <StudentMarks />
    </AuthGate>
  );
}
