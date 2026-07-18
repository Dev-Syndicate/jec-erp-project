// Students page composition — bridges the departments query into the student
// provisioning panel (so the roles feature never imports the departments
// feature). Client component because it reads the department list for the
// picker.
"use client";

import { useDepartments } from "@/features/departments/hooks/use-departments";
import { ProvisionStudentPanel } from "@/features/roles/components/provision-student-panel";
import { PageHeader } from "@/app/(app)/page-header";

export function StudentsView() {
  const departments = useDepartments();
  const options = (departments.data ?? [])
    .filter((d) => d.isActive)
    .map((d) => ({ id: d.id, name: d.name, code: d.code }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <PageHeader
        eyebrow="Manage"
        title="Students"
        description="Add student accounts. They sign in with their roll number and reset the temporary password on first login."
      />
      <ProvisionStudentPanel departments={options} />
    </main>
  );
}
