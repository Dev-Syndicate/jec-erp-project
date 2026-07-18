// A department picker that shows the department NAME, not its id.
//
// Base UI's Select renders the raw `value` (here a cuid) in the trigger unless
// you give Select.Value a render function mapping value → label. Radix shows the
// selected item's text automatically; Base UI does not — this component
// encapsulates that difference so provisioning forms don't each re-trip on it.
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DepartmentOption } from "@/features/roles/types";

export function DepartmentSelect({
  id,
  value,
  onChange,
  departments,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  departments: DepartmentOption[];
}) {
  const label = (deptId: unknown) => {
    const d = departments.find((x) => x.id === deptId);
    return d ? d.name : "Select a department";
  };

  return (
    <Select value={value} onValueChange={(v) => onChange((v as string) ?? "")}>
      {/* h-10! to match the h-10 text inputs beside it — the trigger's built-in
          data-[size=default]:h-8 variant otherwise out-specifies a plain h-10. */}
      <SelectTrigger id={id} className="h-10! w-full">
        <SelectValue placeholder="Select a department">{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {departments.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
