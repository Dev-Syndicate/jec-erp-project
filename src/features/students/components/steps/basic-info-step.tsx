// Basic Info step of the admission wizard. Loads existing profile values, edits
// them, and saves via PUT /api/students/[id]/admission/basic. Required to save:
// full name (SSC), seat type, accommodation. Everything else is optional.
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLookups, useSaveBasicInfo } from "@/features/students/hooks/use-students";
import type { BasicInfo, StudentDetail } from "@/features/students/types";
import { EnumSelect, Field, LookupSelect, Section } from "@/features/students/components/steps/step-ui";

// Fixed scholarship options (the value is stored as a plain string).
const SCHOLARSHIP_TYPES = ["First Graduate", "PMSS", "BC / MBC", "SC / ST", "Minority", "Others"];

function initialValues(student: StudentDetail | undefined): BasicInfo {
  const p = student?.profile;
  return {
    fullNameSSC: p?.fullNameSSC ?? student?.name ?? "",
    region: p?.region ?? "",
    alternatePhone: p?.alternatePhone ?? "",
    seatTypeCategory: p?.seatTypeCategory ?? "",
    aadhaarNumber: p?.aadhaarNumber ?? "",
    nationality: p?.nationality ?? "",
    scholarshipType: p?.scholarshipType ?? "",
    accommodation: p?.accommodation ?? "",
    religionId: p?.religionId ?? "",
    categoryId: p?.categoryId ?? "",
    casteId: p?.casteId ?? "",
    dateOfBirth: student?.dateOfBirth ? student.dateOfBirth.slice(0, 10) : "",
    gender: student?.gender ?? "",
  };
}

export function BasicInfoStep({
  studentId,
  student,
}: {
  studentId: string;
  student: StudentDetail | undefined;
}) {
  const lookups = useLookups();
  const save = useSaveBasicInfo(studentId);
  const [form, setForm] = useState<BasicInfo>(() => initialValues(student));
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof BasicInfo>(key: K, value: BasicInfo[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const canSave =
    !!form.fullNameSSC.trim() && !!form.seatTypeCategory && !!form.accommodation && !save.isPending;

  function submit() {
    save.mutate(form, { onSuccess: () => setSaved(true) });
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) submit();
      }}
    >
      <Section title="Basic info">
        <Field label="Full name (as per SSC)" htmlFor="b-name">
          <Input id="b-name" value={form.fullNameSSC} onChange={(e) => set("fullNameSSC", e.target.value)} required className="h-10" placeholder="VASIPALLI VIGNESWAR REDDY" />
        </Field>
        <Field label="Seat type" htmlFor="b-seat">
          <EnumSelect id="b-seat" value={form.seatTypeCategory} onChange={(v) => set("seatTypeCategory", v as BasicInfo["seatTypeCategory"])}
            options={[{ value: "CONVENER", label: "Convener" }, { value: "MANAGEMENT", label: "Management" }]} placeholder="Select" />
        </Field>
        <Field label="Accommodation" htmlFor="b-acc">
          <EnumSelect id="b-acc" value={form.accommodation} onChange={(v) => set("accommodation", v as BasicInfo["accommodation"])}
            options={[{ value: "DAY_SCHOLAR", label: "Day scholar" }, { value: "HOSTEL", label: "Hostel" }]} placeholder="Select" />
        </Field>
        <Field label="Date of birth" htmlFor="b-dob" optional>
          <Input id="b-dob" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} className="h-10" />
        </Field>
        <Field label="Gender" htmlFor="b-gender" optional>
          <EnumSelect id="b-gender" value={form.gender} onChange={(v) => set("gender", v as BasicInfo["gender"])}
            options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }, { value: "OTHER", label: "Other" }]} placeholder="Select" />
        </Field>
        <Field label="Alternate phone" htmlFor="b-alt" optional>
          <Input id="b-alt" type="tel" value={form.alternatePhone} onChange={(e) => set("alternatePhone", e.target.value)} className="h-10" placeholder="+91 …" />
        </Field>
        <Field label="Aadhaar number" htmlFor="b-aadhaar" optional>
          <Input id="b-aadhaar" value={form.aadhaarNumber} onChange={(e) => set("aadhaarNumber", e.target.value)} className="h-10" placeholder="XXXX XXXX XXXX" />
        </Field>
        <Field label="Nationality" htmlFor="b-nat" optional>
          <Input id="b-nat" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} className="h-10" placeholder="Indian" />
        </Field>
        <Field label="Region" htmlFor="b-region" optional>
          <Input id="b-region" value={form.region} onChange={(e) => set("region", e.target.value)} className="h-10" placeholder="Tamil Nadu" />
        </Field>
      </Section>

      <Section title="Community & scholarship">
        <Field label="Religion" htmlFor="b-rel" optional>
          <LookupSelect id="b-rel" value={form.religionId} onChange={(v) => set("religionId", v)} options={lookups.data?.religions ?? []} />
        </Field>
        <Field label="Category" htmlFor="b-cat" optional>
          <LookupSelect id="b-cat" value={form.categoryId} onChange={(v) => set("categoryId", v)} options={lookups.data?.categories ?? []} />
        </Field>
        <Field label="Caste" htmlFor="b-caste" optional>
          <LookupSelect id="b-caste" value={form.casteId} onChange={(v) => set("casteId", v)} options={lookups.data?.castes ?? []} emptyLabel="No castes configured" />
        </Field>
        <Field label="Scholarship type" htmlFor="b-schol" optional>
          <LookupSelect
            id="b-schol"
            value={form.scholarshipType}
            onChange={(v) => set("scholarshipType", v)}
            options={SCHOLARSHIP_TYPES.map((t) => ({ id: t, name: t }))}
            placeholder="Select"
          />
        </Field>
      </Section>

      {save.isError && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {save.error instanceof Error ? save.error.message : "Couldn’t save."}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSave}>
          {save.isPending ? "Saving…" : "Save basic info"}
        </Button>
        {saved && <span className="text-sm text-status-present-foreground">Saved.</span>}
      </div>
    </form>
  );
}
