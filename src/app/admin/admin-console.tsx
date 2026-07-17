// Admin console composition. Lives with the route (not in a feature) because it
// orchestrates two features — departments + roles/provisioning — and the app
// layer is where cross-feature composition belongs. It bridges the departments
// query into the provisioning panel's `departments` prop so neither feature
// imports the other.
"use client";

import { DepartmentsPanel } from "@/features/departments/components/departments-panel";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { ProvisionStaffPanel } from "@/features/roles/components/provision-staff-panel";

export function AdminConsole() {
  // Single source for the department list on this page — the table renders it
  // and the provisioning picker selects from it, so they stay in sync.
  const departments = useDepartments();
  const options = (departments.data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
  }));

  return (
    <main className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-1.5">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-primary">
          Super Admin · Console
        </span>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Institution setup
        </h1>
        <p className="text-sm text-muted-foreground">
          Create departments and provision staff. Everything else in the ERP hangs off this
          structure.
        </p>
      </header>

      <DepartmentsPanel />
      <ProvisionStaffPanel departments={options} />
    </main>
  );
}
