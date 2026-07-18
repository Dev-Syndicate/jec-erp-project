// Add-student page composition — the provisioning form. Bridges the departments
// query into the provisioning panel (so the roles feature never imports the
// departments feature). After creating the account, the admin opens the student
// from the list to complete the full admission form.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { ProvisionStudentPanel } from "@/features/roles/components/provision-student-panel";
import { PageHeader } from "@/app/(app)/page-header";

export function NewStudentView() {
  const router = useRouter();
  const departments = useDepartments();
  const options = (departments.data ?? [])
    .filter((d) => d.isActive)
    .map((d) => ({ id: d.id, name: d.name, code: d.code }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/students" />}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
      <PageHeader
        eyebrow="Manage · Students"
        title="Add student"
        description="Create the account, then continue into the admission form — personal details, education, banks and documents."
      />
      <ProvisionStudentPanel
        departments={options}
        departmentsLoading={departments.isPending}
        showHeading={false}
        onCreated={(user) => {
          // Straight into the admission wizard for the new student. The temp
          // password rides along (shown once) so the admin can still relay it.
          if (user.studentId) {
            const pw = encodeURIComponent(user.tempPassword);
            router.push(`/admin/students/${user.studentId}?tempPassword=${pw}`);
          }
        }}
      />
    </main>
  );
}
