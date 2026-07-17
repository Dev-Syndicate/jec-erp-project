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
import { useProvisionStaff } from "@/features/roles/hooks/use-provisioning";
import type { DepartmentOption, ProvisionedUser } from "@/features/roles/types";

type StaffRole = "HOD" | "Teacher";

export function ProvisionStaffPanel({ departments }: { departments: DepartmentOption[] }) {
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
          setResult(user);
          setEmail("");
          setDisplayName("");
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">Provision staff</h2>
        <p className="text-sm text-muted-foreground">
          Create an HOD or teacher account. They’ll get a temporary password and reset it on first
          login.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        {departments.length === 0 ? (
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
                  <SelectTrigger id="staff-role" className="h-10 w-full">
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
                <Select
                  value={departmentId}
                  onValueChange={(v) => setDepartmentId((v as string) ?? "")}
                >
                  <SelectTrigger id="staff-dept" className="h-10 w-full">
                    <SelectValue placeholder="Select a department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.code} — {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

// Shown once after a successful provision. The temp password is sensitive and
// won't be retrievable again — the admin relays it, then dismisses this.
function ProvisionResult({ user, onDismiss }: { user: ProvisionedUser; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-accent/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-primary">
            Account created
          </p>
          <p className="mt-1 text-sm text-foreground">
            {user.displayName} · {user.role} · {user.email}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          Temporary password — shown once
        </span>
        <div className="flex items-center justify-between gap-3">
          <code className="text-sm text-foreground">{user.tempPassword}</code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(user.tempPassword).then(
                () => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                },
                () => setCopied(false),
              );
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Relay this to {user.displayName.split(" ")[0]} securely. They’ll be forced to set a new
        password on first login. Email delivery replaces this step in a later phase.
      </p>
    </div>
  );
}
