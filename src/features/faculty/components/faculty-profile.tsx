// Faculty profile page — view/edit one staff member's profile. Loads the staff
// member, shows the account facts (name, role, department) as read-only header,
// then the editable Profile form. A single form for now; tabs (Experience, Bank,
// Documents…) are added when those phases land (docs/faculty-profile-schema.md).
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TempPasswordBanner } from "@/components/temp-password-banner";
import { useFaculty } from "@/features/faculty/hooks/use-faculty";
import { FacultyProfileForm } from "@/features/faculty/components/faculty-profile-form";
import { RegeneratePasswordButton } from "@/features/faculty/components/regenerate-password-button";

export function FacultyProfile({ facultyId }: { facultyId: string }) {
  const faculty = useFaculty(facultyId);
  // Temp password to reveal once: from creation (redirect query) or a manual
  // regenerate (state). Either surfaces the same banner.
  const passwordFromUrl = useSearchParams().get("tempPassword");
  const [regenerated, setRegenerated] = useState<string | null>(null);
  const tempPassword = regenerated ?? passwordFromUrl;

  const data = faculty.data;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/faculty" />}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-primary">
            Faculty profile
          </p>
          <h1 className="truncate font-heading text-xl font-semibold text-foreground">
            {data ? data.name : "Loading…"}
          </h1>
        </div>
        {data && <RegeneratePasswordButton facultyId={facultyId} onGenerated={setRegenerated} />}
      </div>

      {faculty.isError ? (
        <p className="text-sm text-destructive">
          {faculty.error instanceof Error ? faculty.error.message : "Couldn’t load this faculty member."}
        </p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      ) : (
        <>
          {tempPassword && (
            <TempPasswordBanner
              name={data.name}
              email={data.email}
              tempPassword={tempPassword}
              headline={
                regenerated
                  ? "New temporary password generated"
                  : "Account created — complete the profile below"
              }
            />
          )}

          {/* Account facts — from the User, not editable here (role/department
              are managed via provisioning/roles, not the profile). */}
          <dl className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-3">
            <Fact label="Role" value={data.roles.join(" · ") || "—"} />
            <Fact label="Department" value={data.departmentName ?? "—"} />
            <Fact label="Email" value={data.email} />
          </dl>

          <FacultyProfileForm facultyId={facultyId} faculty={data} />
        </>
      )}
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate text-sm text-foreground">{value}</dd>
    </div>
  );
}
