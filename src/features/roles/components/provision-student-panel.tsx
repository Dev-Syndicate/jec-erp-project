// Provision-student panel — creates a student account. Students log in with
// roll number + password, but the account is backed by a real email (Firebase
// identity + password-delivery channel). Admission number + DOB back the
// self-activation fallback. POST /api/users generates the temp password and
// forces a first-login reset.
//
// departments come in as a prop so the roles feature doesn't import departments.
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DepartmentSelect } from "@/features/roles/components/department-select";
import { ProvisionResult } from "@/features/roles/components/provision-result";
import { useProvisionStudent } from "@/features/roles/hooks/use-provisioning";
import type { DepartmentOption, ProvisionedUser } from "@/features/roles/types";

export function ProvisionStudentPanel({ departments }: { departments: DepartmentOption[] }) {
  const provision = useProvisionStudent();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [result, setResult] = useState<ProvisionedUser | null>(null);

  const canSubmit =
    displayName &&
    email &&
    rollNumber &&
    admissionNumber &&
    dateOfBirth &&
    departmentId &&
    !provision.isPending;

  function submit() {
    provision.mutate(
      { displayName, email, rollNumber, admissionNumber, dateOfBirth, departmentId },
      {
        onSuccess: (user) => {
          setResult(user);
          setDisplayName("");
          setEmail("");
          setRollNumber("");
          setAdmissionNumber("");
          setDateOfBirth("");
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">Add a student</h2>
        <p className="text-sm text-muted-foreground">
          Students sign in with their roll number. The temporary password goes to the email on
          file, and they reset it on first login.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        {departments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Create a department first — every student belongs to one.
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
              <Field label="Full name" htmlFor="stu-name">
                <Input
                  id="stu-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  placeholder="Priya R."
                  className="h-10"
                />
              </Field>
              <Field label="Email" htmlFor="stu-email">
                <Input
                  id="stu-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="priya.r@jeppiaar.edu.in"
                  className="h-10"
                />
              </Field>
              <Field label="Roll number" htmlFor="stu-roll">
                <Input
                  id="stu-roll"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  required
                  placeholder="21CS042"
                  autoCapitalize="characters"
                  className="h-10 uppercase"
                />
              </Field>
              <Field label="Admission number" htmlFor="stu-adm">
                <Input
                  id="stu-adm"
                  value={admissionNumber}
                  onChange={(e) => setAdmissionNumber(e.target.value)}
                  required
                  placeholder="ADM2021042"
                  className="h-10"
                />
              </Field>
              <Field label="Date of birth" htmlFor="stu-dob">
                <Input
                  id="stu-dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  required
                  className="h-10"
                />
              </Field>
              <Field label="Department" htmlFor="stu-dept">
                <DepartmentSelect
                  id="stu-dept"
                  value={departmentId}
                  onChange={setDepartmentId}
                  departments={departments}
                />
              </Field>
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
                {provision.isPending ? "Creating…" : "Create student"}
              </Button>
            </div>
          </form>
        )}
      </div>

      {result && <ProvisionResult user={result} onDismiss={() => setResult(null)} />}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
