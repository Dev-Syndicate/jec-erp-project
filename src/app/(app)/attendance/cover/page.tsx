// /attendance/cover — assign a stand-in for a period whose teacher is away, so
// the hour can still be marked. Shown to HOD / Super Admin; the API is the real
// boundary and enforces `manage Attendance` scoped to the class's program.
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
