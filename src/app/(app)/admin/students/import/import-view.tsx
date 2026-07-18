// Bulk import page composition. Bridges the departments query + the current
// user's role/department into the import component (so the students/roles
// features don't import the departments feature). A HOD is locked to their own
// department; a Super Admin picks any.
"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useFirebaseUser, useMe } from "@/features/auth/hooks/use-auth";
import { ImportStudents } from "@/features/students/components/import-students";
import { PageHeader } from "@/app/(app)/page-header";

export function ImportStudentsView() {
  const { firebaseUser } = useFirebaseUser();
  const me = useMe(!!firebaseUser);
  const isSuperAdmin = me.data?.roles.includes("Super Admin") ?? false;

  const departments = useDepartments();
  const options = (departments.data ?? [])
    .filter((d) => d.isActive)
    .map((d) => ({ id: d.id, name: d.name, code: d.code }));

  // HOD: pinned to their own department (no picker).
  const lockedDepartmentId = !isSuperAdmin ? me.data?.departmentId ?? undefined : undefined;

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
        title="Bulk import"
        description="Upload a CSV or Excel sheet to create many student accounts at once. Download the results file to hand out login credentials."
      />
      <ImportStudents departments={options} lockedDepartmentId={lockedDepartmentId} />
    </main>
  );
}
