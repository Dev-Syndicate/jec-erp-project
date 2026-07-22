// A Base UI Select that shows the chosen option's label (not the raw value) in
// the trigger — the render-fn pattern from department-select.tsx. Local to the
// timetable feature (no cross-feature imports).
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FormSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  disabled?: boolean;
}) {
  const label = (v: unknown) => options.find((o) => o.value === v)?.label ?? placeholder;
  return (
    <Select value={value} onValueChange={(v) => onChange((v as string) ?? "")} disabled={disabled}>
      <SelectTrigger id={id} className="h-10! w-full">
        {/* min-w-0 + a truncating span so a long option label (e.g. a full lab
            subject name) ellipsises instead of overflowing into the chevron. */}
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
