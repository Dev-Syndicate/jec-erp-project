// Teacher assignments page composition. Bridges departments + the current user's
// role/dept into the manager (HOD pinned to own dept; Super Admin picks any).
"use client";

import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useFirebaseUser, useMe } from "@/features/auth/hooks/use-auth";
import { AssignmentsManager } from "@/features/academic/components/assignments-manager";
import { PageHeader } from "@/app/(app)/page-header";

export function AssignmentsView() {
  const { firebaseUser } = useFirebaseUser();
  const me = useMe(!!firebaseUser);
  const isSuperAdmin = me.data?.roles.includes("Super Admin") ?? false;

  const departments = useDepartments();
  const options = (departments.data ?? [])
    .filter((d) => d.isActive)
    .map((d) => ({ id: d.id, name: d.name }));

  const lockedDepartmentId = !isSuperAdmin ? me.data?.departmentId ?? undefined : undefined;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <PageHeader
        eyebrow="Academic"
        title="Teacher assignments"
        description="For the active term, assign who teaches which subject to which section. This is what lets a teacher mark that section’s attendance."
      />
      <AssignmentsManager departments={options} lockedDepartmentId={lockedDepartmentId} />
    </main>
  );
}
