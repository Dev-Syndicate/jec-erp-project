// Faculty list page (/admin/faculty) — browse staff and open a member's
// profile. "Add faculty" lives on its own page (/admin/faculty/new), reachable
// from the sidebar and the button here.
"use client";

import Link from "next/link";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FacultyList } from "@/features/faculty/components/faculty-list";
import { PageHeader } from "@/app/(app)/page-header";

export function FacultyView() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <PageHeader
        eyebrow="Manage · Faculty"
        title="All faculty"
        description="Open a staff member to complete their profile. Each signs in with their college email."
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-end">
          <Button size="sm" nativeButton={false} render={<Link href="/admin/faculty/new" />}>
            <UserPlus className="size-4" />
            Add faculty
          </Button>
        </div>
        <FacultyList />
      </section>
    </main>
  );
}
