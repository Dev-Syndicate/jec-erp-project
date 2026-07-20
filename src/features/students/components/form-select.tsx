// A Base UI Select that shows the chosen option's label (not the raw value) in
// the trigger — the render-fn pattern from department-select.tsx. Shared by the
// student create/edit and import dialogs.
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
}: {
  id?: string;
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
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
