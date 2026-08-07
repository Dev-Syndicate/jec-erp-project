// The labelled Select every form in the app reaches for. Lives here, beside
// DepartmentSelect, because features must not import from each other — nine
// byte-for-byte copies of this file existed under src/features/*/components/
// for exactly that reason, which is the wrong fix: shared UI belongs in
// src/components, and only feature-SPECIFIC UI belongs in a feature.
//
// What it encapsulates: Base UI's Select renders the raw `value` in the trigger
// (here usually a cuid) unless Select.Value is given a render function mapping
// value → label. Radix did that automatically; Base UI does not. Every form
// would otherwise re-trip on it.
//
// The union of the nine copies, so this is a strict superset of all of them:
//   · `disabled` — eight had it, the faculty copy did not.
//   · truncation — only the timetable copy had it, because a full lab subject
//     name overflowed into the chevron. Long labels can appear in any picker,
//     so it is on for everyone; a short label is unaffected by `truncate`.
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FormSelectOption = { value: string; label: string };

export function FormSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  size = "lg",
  className,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: FormSelectOption[];
  placeholder: string;
  disabled?: boolean;
  /** Matches Input's scale. `lg` (40px) is the form default. */
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const label = (v: unknown) => options.find((o) => o.value === v)?.label ?? placeholder;

  return (
    <Select value={value} onValueChange={(v) => onChange((v as string) ?? "")} disabled={disabled}>
      <SelectTrigger id={id} size={size} className={className ?? "w-full"}>
        <SelectValue placeholder={placeholder} className="min-w-0">
          {(v: unknown) => <span className="min-w-0 flex-1 truncate">{label(v)}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
