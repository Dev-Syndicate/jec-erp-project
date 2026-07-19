// Subjects page composition. Bridges departments + the current user's role/dept
// into the subjects manager (HOD pinned to own dept; Super Admin picks any).
"use client";

import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useFirebaseUser, useMe } from "@/features/auth/hooks/use-auth";
import { SubjectsManager } from "@/features/academic/components/subjects-manager";
import { PageHeader } from "@/app/(app)/page-header";

export function SubjectsView() {
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
        title="Subjects"
        description="The curriculum catalog, grouped by semester. Reused every batch; on a syllabus change, add the new subject and deactivate the old one."
      />
      <SubjectsManager departments={options} lockedDepartmentId={lockedDepartmentId} />
    </main>
  );
}
