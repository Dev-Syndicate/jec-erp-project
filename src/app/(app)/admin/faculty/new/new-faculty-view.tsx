// Add-faculty page composition — the provisioning form only. Bridges the
// departments query into the provisioning panel (so the roles feature never
// imports the departments feature). After creating the account, the admin is
// redirected straight into that member's profile to complete the rest.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { ProvisionStaffPanel } from "@/features/roles/components/provision-staff-panel";
import { PageHeader } from "@/app/(app)/page-header";

export function NewFacultyView() {
  const router = useRouter();
  const departments = useDepartments();
  const options = (departments.data ?? [])
    .filter((d) => d.isActive)
    .map((d) => ({ id: d.id, name: d.name, code: d.code }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/faculty" />}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
      <PageHeader
        eyebrow="Manage · Faculty"
        title="Add faculty"
        description="Create the account, then continue into the profile — designation, personal details and more."
      />
      <ProvisionStaffPanel
        departments={options}
        departmentsLoading={departments.isPending}
        showHeading={false}
        onCreated={(user) => {
          // Straight into the new staff member's profile (their User id). The
          // temp password rides along (shown once) so the admin can relay it.
          router.push(`/admin/faculty/${user.id}?tempPassword=${encodeURIComponent(user.tempPassword)}`);
        }}
      />
    </main>
  );
}
