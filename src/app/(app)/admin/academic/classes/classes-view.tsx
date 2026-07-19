// Classes & Sections page composition. Bridges the departments query + the
// current user's role/department into the manager (so the academic feature
// doesn't import the departments feature). HOD is pinned to their own dept;
// Super Admin picks any.
"use client";

import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useFirebaseUser, useMe } from "@/features/auth/hooks/use-auth";
import { ClassesManager } from "@/features/academic/components/classes-manager";
import { PageHeader } from "@/app/(app)/page-header";

export function ClassesView() {
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
        title="Classes & sections"
        description="Set up the class groups (e.g. II B.Tech) and their sections. Attendance and assignments target a section."
      />
      <ClassesManager departments={options} lockedDepartmentId={lockedDepartmentId} />
    </main>
  );
}
