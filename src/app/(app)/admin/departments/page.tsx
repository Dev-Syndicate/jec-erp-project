// /admin/departments — manage the org structure's top level. Super Admin only
// (the API re-enforces on every write). Auth + shell come from the (app) layout.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { DepartmentsPanel } from "@/features/departments/components/departments-panel";
import { PageHeader } from "@/app/(app)/page-header";

export default function DepartmentsPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <PageHeader
          eyebrow="Manage"
          title="Departments"
          description="Create and maintain departments. Classes, staff, and students all sit under one."
        />
        <DepartmentsPanel />
      </main>
    </AuthGate>
  );
}
