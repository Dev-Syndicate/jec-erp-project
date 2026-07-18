// Students list page (/admin/students) — browse students and open a student's
// admission form. "Add student" lives on its own page (/admin/students/new),
// reachable from the sidebar and the button here.
"use client";

import Link from "next/link";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StudentsList } from "@/features/students/components/students-list";
import { PageHeader } from "@/app/(app)/page-header";

export function StudentsView() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <PageHeader
        eyebrow="Manage · Students"
        title="All students"
        description="Open a student to complete their admission form. They sign in with their roll number."
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-end">
          <Button size="sm" nativeButton={false} render={<Link href="/admin/students/new" />}>
            <UserPlus className="size-4" />
            Add student
          </Button>
        </div>
        <StudentsList />
      </section>
    </main>
  );
}
