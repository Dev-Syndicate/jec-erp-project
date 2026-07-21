// A Year → Section drill-down over a program's classes. The program is chosen
// elsewhere (a student already has one; the create/import dialogs pick it first),
// so within it a class is just year × section — two short selects instead of one
// long "B.E · CSE · II-A / …" list. Reports the chosen classId ("" when cleared).
//
// It's self-contained: give it the classes for ONE program and an optional
// `initialClassId`. To reset it when the program changes, remount it with a
// React `key` (e.g. key={programId}) rather than syncing props — no effects.
"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { FormSelect } from "@/features/students/components/form-select";
import type { ClassOption } from "@/features/students/types";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

export function ClassCascade({
  classes,
  initialClassId = "",
  onChange,
  loading = false,
  disabled = false,
  idPrefix = "cc",
}: {
  classes: ClassOption[]; // already filtered to the target program
  initialClassId?: string;
  onChange: (classId: string) => void;
  loading?: boolean;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const initial = classes.find((c) => c.id === initialClassId);
  const [year, setYear] = useState<string>(initial ? String(initial.year) : "");
  const [classId, setClassId] = useState<string>(initial?.id ?? "");

  const years = [...new Set(classes.map((c) => c.year))].sort((a, b) => a - b);
  const sections = classes
    .filter((c) => String(c.year) === year)
    .sort((a, b) => a.section.localeCompare(b.section));

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-year`}>Year</Label>
        <FormSelect
          id={`${idPrefix}-year`}
          value={year}
          onChange={(v) => {
            setYear(v);
            setClassId(""); // sections differ per year — reset the choice
            onChange("");
          }}
          options={years.map((y) => ({ value: String(y), label: `Year ${roman(y)}` }))}
          placeholder={
            loading ? "Loading…" : disabled ? "Pick a program first" : years.length === 0 ? "No classes yet" : "Select year"
          }
          disabled={disabled || years.length === 0}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-section`}>Section</Label>
        <FormSelect
          id={`${idPrefix}-section`}
          value={classId}
          onChange={(v) => {
            setClassId(v);
            onChange(v);
          }}
          options={sections.map((c) => ({ value: c.id, label: `Section ${c.section}` }))}
          placeholder={year === "" ? "Pick a year first" : sections.length === 0 ? "No sections" : "Select section"}
          disabled={disabled || year === ""}
        />
      </div>
    </div>
  );
}
