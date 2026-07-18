// Faculty profile form — the Profile tab (Faculty Details + Personal Details).
// Loads existing values, edits them, saves via PUT /api/faculty/[id]/profile.
// Required to save: designation, staff ID, phone. Everything else is optional.
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
import { useSaveFacultyProfile } from "@/features/faculty/hooks/use-faculty";
import type { FacultyDetail, FacultyProfileInput } from "@/features/faculty/types";

function initialValues(faculty: FacultyDetail | undefined): FacultyProfileInput {
  const p = faculty?.profile;
  return {
    designation: p?.designation ?? "",
    staffId: p?.staffId ?? "",
    phone: p?.phone ?? "",
    emergencyPhone: p?.emergencyPhone ?? "",
    gender: p?.gender ?? "",
    dateOfBirth: p?.dateOfBirth ? p.dateOfBirth.slice(0, 10) : "",
    maritalStatus: p?.maritalStatus ?? "",
    fatherName: p?.fatherName ?? "",
    motherName: p?.motherName ?? "",
  };
}

export function FacultyProfileForm({
  facultyId,
  faculty,
}: {
  facultyId: string;
  faculty: FacultyDetail | undefined;
}) {
  const save = useSaveFacultyProfile(facultyId);
  const [form, setForm] = useState<FacultyProfileInput>(() => initialValues(faculty));
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof FacultyProfileInput>(key: K, value: FacultyProfileInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const canSave =
    !!form.designation.trim() && !!form.staffId.trim() && !!form.phone.trim() && !save.isPending;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) save.mutate(form, { onSuccess: () => setSaved(true) });
      }}
    >
      <Section title="Faculty details">
        <Field label="Designation" htmlFor="f-desig">
          <Input id="f-desig" value={form.designation} onChange={(e) => set("designation", e.target.value)} required className="h-10" placeholder="Asst. Professor" />
        </Field>
        <Field label="Staff ID" htmlFor="f-staff">
          <Input id="f-staff" value={form.staffId} onChange={(e) => set("staffId", e.target.value)} required className="h-10" placeholder="110018" />
        </Field>
      </Section>

      <Section title="Personal details">
        <Field label="Phone" htmlFor="f-phone">
          <Input id="f-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required className="h-10" placeholder="9884682121" />
        </Field>
        <Field label="Emergency phone" htmlFor="f-ephone" optional>
          <Input id="f-ephone" type="tel" value={form.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} className="h-10" />
        </Field>
        <Field label="Gender" htmlFor="f-gender" optional>
          <EnumSelect id="f-gender" value={form.gender} onChange={(v) => set("gender", v as FacultyProfileInput["gender"])}
            options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }, { value: "OTHER", label: "Other" }]} placeholder="Select" />
        </Field>
        <Field label="Date of birth" htmlFor="f-dob" optional>
          <Input id="f-dob" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} className="h-10" />
        </Field>
        <Field label="Marital status" htmlFor="f-marital" optional>
          <EnumSelect id="f-marital" value={form.maritalStatus} onChange={(v) => set("maritalStatus", v as FacultyProfileInput["maritalStatus"])}
            options={[{ value: "SINGLE", label: "Single" }, { value: "MARRIED", label: "Married" }, { value: "OTHER", label: "Other" }]} placeholder="Select" />
        </Field>
        <Field label="Father's name" htmlFor="f-father" optional>
          <Input id="f-father" value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} className="h-10" />
        </Field>
        <Field label="Mother's name" htmlFor="f-mother" optional>
          <Input id="f-mother" value={form.motherName} onChange={(e) => set("motherName", e.target.value)} className="h-10" />
        </Field>
      </Section>

      {save.isError && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {save.error instanceof Error ? save.error.message : "Couldn’t save."}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSave}>
          {save.isPending ? "Saving…" : "Save profile"}
        </Button>
        {saved && <span className="text-sm text-status-present-foreground">Saved.</span>}
      </div>
    </form>
  );
}

// --- small building blocks (faculty-local; features must not import each other) ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

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

function EnumSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  const label = (v: unknown) => options.find((o) => o.value === v)?.label ?? placeholder;
  return (
    <Select value={value} onValueChange={(v) => onChange((v as string) ?? "")}>
      <SelectTrigger id={id} className="h-10! w-full">
        <SelectValue placeholder={placeholder}>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
