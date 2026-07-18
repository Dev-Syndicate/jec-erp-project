// Provision-student panel — creates the student ANCHOR account (identity +
// login handle). Students log in with roll number + password; the account is
// backed by a real email (Firebase identity + password-delivery channel).
// POST /api/users generates the temp password and forces a first-login reset.
//
// The FULL admission record (profile, address, guardians, education, banks,
// documents) is filled in via the admission wizard — not here. This form only
// captures what's needed to create the account.
//
// departments come in as a prop so the roles feature doesn't import departments.
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
import { useProvisionStudent } from "@/features/roles/hooks/use-provisioning";
import type { DepartmentOption, Gender, ProvisionedUser } from "@/features/roles/types";

const GENDERS: Array<{ value: Gender; label: string }> = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

const BLANK = {
  displayName: "",
  email: "",
  rollNumber: "",
  registerNumber: "",
  dateOfBirth: "",
  phone: "",
  gender: "" as Gender | "",
  departmentId: "",
};

export function ProvisionStudentPanel({ departments }: { departments: DepartmentOption[] }) {
  const provision = useProvisionStudent();
  const [form, setForm] = useState(BLANK);
  const [result, setResult] = useState<ProvisionedUser | null>(null);

  const set = <K extends keyof typeof BLANK>(key: K, value: (typeof BLANK)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSubmit =
    form.displayName &&
    form.email &&
    form.rollNumber &&
    form.dateOfBirth &&
    form.phone &&
    form.departmentId &&
    !provision.isPending;

  function submit() {
    provision.mutate(
      {
        displayName: form.displayName,
        email: form.email,
        rollNumber: form.rollNumber,
        registerNumber: form.registerNumber || undefined,
        dateOfBirth: form.dateOfBirth,
        phone: form.phone,
        gender: form.gender || undefined,
        departmentId: form.departmentId,
      },
      { onSuccess: (user) => { setResult(user); setForm(BLANK); } },
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">Add a student</h2>
        <p className="text-sm text-muted-foreground">
          This creates the account. Full admission details (address, guardians, documents…) are
          completed afterwards in the student’s admission form.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        {departments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Create a department first — every student belongs to one.
          </p>
        ) : (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) submit();
            }}
          >
            <Field label="Full name" htmlFor="stu-name">
              <Input id="stu-name" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} required placeholder="Priya R." className="h-10" />
            </Field>
            <Field label="Email" htmlFor="stu-email">
              <Input id="stu-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required placeholder="priya.r@jeppiaar.edu.in" className="h-10" />
            </Field>
            <Field label="Roll number" htmlFor="stu-roll">
              <Input id="stu-roll" value={form.rollNumber} onChange={(e) => set("rollNumber", e.target.value)} required placeholder="21CS042" autoCapitalize="characters" className="h-10 uppercase" />
            </Field>
            <Field label="Registration number" htmlFor="stu-reg" optional>
              <Input id="stu-reg" value={form.registerNumber} onChange={(e) => set("registerNumber", e.target.value)} placeholder="422021104042" autoCapitalize="characters" className="h-10 uppercase" />
            </Field>
            <Field label="Date of birth" htmlFor="stu-dob">
              <Input id="stu-dob" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} required className="h-10" />
            </Field>
            <Field label="Phone" htmlFor="stu-phone">
              <Input id="stu-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required placeholder="+91 98765 43210" className="h-10" />
            </Field>
            <Field label="Gender" htmlFor="stu-gender" optional>
              <Select value={form.gender} onValueChange={(v) => set("gender", (v as Gender) ?? "")}>
                <SelectTrigger id="stu-gender" className="h-10! w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department" htmlFor="stu-dept">
              <DepartmentSelect id="stu-dept" value={form.departmentId} onChange={(v) => set("departmentId", v)} departments={departments} />
            </Field>

            {provision.isError && (
              <p role="alert" className="sm:col-span-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {provision.error instanceof Error ? provision.error.message : "Couldn’t create the account."}
              </p>
            )}

            <div className="sm:col-span-2">
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

// Required by default (red *); optional fields carry a muted "Optional" tag.
function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {!optional && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </Label>
        {optional && <span className="text-[0.7rem] text-muted-foreground">Optional</span>}
      </div>
      {children}
    </div>
  );
}
