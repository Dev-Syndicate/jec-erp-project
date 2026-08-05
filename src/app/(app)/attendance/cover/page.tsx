// /attendance/cover — assign a stand-in for a period whose teacher is away, so
// the hour can still be marked. The API is the real boundary and enforces
// `manage Attendance` scoped to the department that owns the class.
//
// This is a HOD's job, and the nav only offers it to them. Super Admin stays in
// the gate deliberately: arranging a department's day-to-day cover isn't their
// work, but a department with no HOD — or one whose HOD is themselves away —
// would otherwise have nobody able to arrange cover at all, leaving the class
// unable to record attendance with no way to unstick it.
//
// Faculty are deliberately absent: granting someone the right to sign another
// teacher's register is a supervised act, not self-service.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { CoverManager } from "@/features/attendance/components/cover-manager";

export default function CoverPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <CoverManager />
    </AuthGate>
  );
}
