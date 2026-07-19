// Personal Info step — the student's guardians (father / mother / guardian) and
// addresses (present / permanent). Both are optional: leave a guardian's name
// blank to omit it, leave an address untouched to omit it. Saved as a set via
// PUT …/admission/personal.
"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import {
  useDistricts,
  useSavePersonalInfo,
  useStates,
} from "@/features/students/hooks/use-students";
import type {
  AddressInput,
  AddressKind,
  GuardianInput,
  GuardianRelation,
  PersonalInfo,
  StudentDetail,
} from "@/features/students/types";
import { Field, LookupSelect, SaveBar, Section } from "@/features/students/components/steps/step-ui";

const INCOME_BANDS = [
  "Below 1 Lac",
  "1 – 2 Lacs",
  "2 – 5 Lacs",
  "5 – 8 Lacs",
  "Above 8 Lacs",
];
const ADDRESS_TYPES = ["Home", "Office", "Other"];

const GUARDIAN_SLOTS: { relation: GuardianRelation; label: string }[] = [
  { relation: "FATHER", label: "Father" },
  { relation: "MOTHER", label: "Mother" },
  { relation: "GUARDIAN", label: "Guardian" },
];
const ADDRESS_SLOTS: { kind: AddressKind; label: string }[] = [
  { kind: "PRESENT", label: "Present address" },
  { kind: "PERMANENT", label: "Permanent address" },
];

function emptyGuardian(relation: GuardianRelation): GuardianInput {
  return { relation, fullName: "", email: "", mobile: "", occupation: "", annualIncome: "", address: "" };
}
function emptyAddress(kind: AddressKind): AddressInput {
  return { kind, state: "", district: "", pincode: "", type: "", addressLine1: "", addressLine2: "" };
}

function initialValues(student: StudentDetail | undefined): PersonalInfo {
  const guardians = GUARDIAN_SLOTS.map(({ relation }) => {
    const existing = student?.guardians.find((g) => g.relation === relation);
    return existing
      ? {
          relation,
          fullName: existing.fullName,
          email: existing.email ?? "",
          mobile: existing.mobile ?? "",
          occupation: existing.occupation ?? "",
          annualIncome: existing.annualIncome ?? "",
          address: existing.address ?? "",
        }
      : emptyGuardian(relation);
  });
  const addresses = ADDRESS_SLOTS.map(({ kind }) => {
    const existing = student?.addresses.find((a) => a.kind === kind);
    return existing
      ? {
          kind,
          state: existing.state,
          district: existing.district,
          pincode: existing.pincode,
          type: existing.type,
          addressLine1: existing.addressLine1,
          addressLine2: existing.addressLine2 ?? "",
        }
      : emptyAddress(kind);
  });
  return { guardians, addresses };
}

export function PersonalInfoStep({
  studentId,
  student,
}: {
  studentId: string;
  student: StudentDetail | undefined;
}) {
  const save = useSavePersonalInfo(studentId);
  const [form, setForm] = useState<PersonalInfo>(() => initialValues(student));
  const [saved, setSaved] = useState(false);

  const setGuardian = (i: number, patch: Partial<GuardianInput>) => {
    setForm((f) => ({ ...f, guardians: f.guardians.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
    setSaved(false);
  };
  const setAddress = (i: number, patch: Partial<AddressInput>) => {
    setForm((f) => ({ ...f, addresses: f.addresses.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
    setSaved(false);
  };

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(form, { onSuccess: () => setSaved(true) });
      }}
    >
      {form.guardians.map((g, i) => (
        <Section key={g.relation} title={GUARDIAN_SLOTS[i].label}>
          <Field label="Full name (as per SSC)" optional>
            <Input value={g.fullName} onChange={(e) => setGuardian(i, { fullName: e.target.value })} className="h-10" placeholder="Leave blank to skip" />
          </Field>
          <Field label="Mobile" optional>
            <Input type="tel" value={g.mobile} onChange={(e) => setGuardian(i, { mobile: e.target.value })} className="h-10" placeholder="+91 …" />
          </Field>
          <Field label="Email" optional>
            <Input type="email" value={g.email} onChange={(e) => setGuardian(i, { email: e.target.value })} className="h-10" />
          </Field>
          <Field label="Occupation" optional>
            <Input value={g.occupation} onChange={(e) => setGuardian(i, { occupation: e.target.value })} className="h-10" />
          </Field>
          <Field label="Annual income" optional>
            <LookupSelect
              value={g.annualIncome}
              onChange={(v) => setGuardian(i, { annualIncome: v })}
              options={INCOME_BANDS.map((b) => ({ id: b, name: b }))}
              placeholder="Select band"
            />
          </Field>
          {g.relation === "GUARDIAN" && (
            <Field label="Address" optional>
              <Input value={g.address} onChange={(e) => setGuardian(i, { address: e.target.value })} className="h-10" />
            </Field>
          )}
        </Section>
      ))}

      {form.addresses.map((a, i) => (
        <AddressFields
          key={a.kind}
          title={ADDRESS_SLOTS[i].label}
          value={a}
          onChange={(patch) => setAddress(i, patch)}
        />
      ))}

      <SaveBar pending={save.isPending} saved={saved} error={save.error} label="Save personal info" />
    </form>
  );
}

// One address block with a cascading state → district picker (India-only, so no
// country field). Options come from the JSON-backed geo route, keyed by name.
// Changing the state clears the district so a mismatched pair can't be saved.
function AddressFields({
  title,
  value,
  onChange,
}: {
  title: string;
  value: AddressInput;
  onChange: (patch: Partial<AddressInput>) => void;
}) {
  const states = useStates();
  const districts = useDistricts(value.state || undefined);
  const toOptions = (names: string[] | undefined) => (names ?? []).map((n) => ({ id: n, name: n }));

  return (
    <Section title={title}>
      <Field label="State" optional>
        <LookupSelect
          value={value.state}
          onChange={(v) => onChange({ state: v, district: "" })}
          options={toOptions(states.data)}
        />
      </Field>
      <Field label="District" optional>
        <LookupSelect
          value={value.district}
          onChange={(v) => onChange({ district: v })}
          options={toOptions(districts.data)}
          placeholder={value.state ? "Select" : "Pick a state first"}
        />
      </Field>
      <Field label="Pincode" optional>
        <Input value={value.pincode} onChange={(e) => onChange({ pincode: e.target.value })} className="h-10" inputMode="numeric" />
      </Field>
      <Field label="Type" optional>
        <LookupSelect
          value={value.type}
          onChange={(v) => onChange({ type: v })}
          options={ADDRESS_TYPES.map((t) => ({ id: t, name: t }))}
          placeholder="Home / Office / …"
        />
      </Field>
      <Field label="Address line 1" optional>
        <Input value={value.addressLine1} onChange={(e) => onChange({ addressLine1: e.target.value })} className="h-10" />
      </Field>
      <Field label="Address line 2" optional>
        <Input value={value.addressLine2} onChange={(e) => onChange({ addressLine2: e.target.value })} className="h-10" />
      </Field>
    </Section>
  );
}
