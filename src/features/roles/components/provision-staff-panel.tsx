// Provision-staff panel — an admin creates an HOD or Teacher account. Wires
// POST /api/users: the server generates a temp password and forces a reset on
// first login. Until email delivery is wired, the temp password is shown here
// once so the admin can relay it.
//
// departments come in as a prop (from the composing /admin page) so this
// feature doesn't import the departments feature.
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DepartmentSelect } from "@/features/roles/components/department-select";
import { ProvisionResult } from "@/features/roles/components/provision-result";
import { useProvisionStaff } from "@/features/roles/hooks/use-provisioning";
import type { DepartmentOption, ProvisionedUser } from "@/features/roles/types";

type StaffRole = "HOD" | "Teacher";

export function ProvisionStaffPanel({
  departments,
  departmentsLoading = false,
  showHeading = true,
  onCreated,
}: {
  departments: DepartmentOption[];
  // While departments load, show a loading state — not "create a department
  // first" (that's the truly-empty state).
  departmentsLoading?: boolean;
  // The composing page may already render an "Add faculty" header; hide the
  // panel's own heading then to avoid a duplicate.
  showHeading?: boolean;
  // Called once the account is created. The faculty page uses it to jump
  // straight into the new member's profile.
  onCreated?: (user: ProvisionedUser) => void;
}) {
  const provision = useProvisionStaff();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<StaffRole>("Teacher");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [result, setResult] = useState<ProvisionedUser | null>(null);

  const canSubmit = email && displayName && departmentId && !provision.isPending;

  function submit() {
    provision.mutate(
      { email, displayName, role, departmentId },
      {
        onSuccess: (user) => {
          setEmail("");
          setDisplayName("");
          // Hand off to the profile if the caller wants it; else show the temp
          // password result inline.
          if (onCreated) onCreated(user);
          else setResult(user);
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {showHeading && (
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">Provision staff</h2>
          <p className="text-sm text-muted-foreground">
            Create an HOD or teacher account. They’ll get a temporary password and reset it on first
            login.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-border p-4">
        {departmentsLoading ? (
          <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            Loading departments…
          </p>
        ) : departments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Create a department first — every staff account belongs to one.
          </p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) submit();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="staff-name">Full name</Label>
                <Input
                  id="staff-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  placeholder="Dr. A. Kumar"
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="staff-email">Email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="a.kumar@jeppiaar.edu.in"
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="staff-role">Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole((v as StaffRole) ?? "Teacher")}
                >
                  <SelectTrigger id="staff-role" className="h-10! w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Teacher">Teacher</SelectItem>
                    <SelectItem value="HOD">HOD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="staff-dept">Department</Label>
                <DepartmentSelect
                  id="staff-dept"
                  value={departmentId}
                  onChange={setDepartmentId}
                  departments={departments}
                />
              </div>
            </div>

            {provision.isError && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {provision.error instanceof Error
                  ? provision.error.message
                  : "Couldn’t create the account."}
              </p>
            )}

            <div>
              <Button type="submit" disabled={!canSubmit}>
                {provision.isPending ? "Creating…" : "Create account"}
              </Button>
            </div>
          </form>
        )}
      </div>

      {result && <ProvisionResult user={result} onDismiss={() => setResult(null)} />}
    </section>
  );
}
