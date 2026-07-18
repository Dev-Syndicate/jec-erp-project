// Faculty page composition — bridges the departments query into the staff
// provisioning panel (so the roles feature never imports the departments
// feature). Client component because it reads the department list for the
// picker.
"use client";

import { useDepartments } from "@/features/departments/hooks/use-departments";
import { ProvisionStaffPanel } from "@/features/roles/components/provision-staff-panel";
import { PageHeader } from "@/app/(app)/page-header";

export function FacultyView() {
  const departments = useDepartments();
  const options = (departments.data ?? [])
    .filter((d) => d.isActive)
    .map((d) => ({ id: d.id, name: d.name, code: d.code }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <PageHeader
        eyebrow="Manage"
        title="Faculty"
        description="Provision HOD and teacher accounts. Each gets a temporary password and resets it on first login."
      />
      <ProvisionStaffPanel departments={options} />
    </main>
  );
}
