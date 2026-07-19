// /admin/academic/years — academic years & terms. Super Admin only (the API
// re-enforces on every write). The active term scopes assignments/attendance.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AcademicManager } from "@/features/academic/components/academic-manager";
import { PageHeader } from "@/app/(app)/page-header";

export default function AcademicYearsPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <PageHeader
          eyebrow="Academic"
          title="Academic year & semesters"
          description="Set up academic years and their odd/even semesters, then activate one of each. The active semester scopes teacher assignments and attendance."
        />
        <AcademicManager />
      </main>
    </AuthGate>
  );
}
