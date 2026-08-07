// A department picker that shows the department NAME, not its id. Shared across
// features (provisioning, import, academic setup), so it lives in components/.
//
// Base UI's Select renders the raw `value` (here a cuid) in the trigger unless
// you give Select.Value a render function mapping value → label. Radix shows the
// selected item's text automatically; Base UI does not — this component
// encapsulates that difference so forms don't each re-trip on it.
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Minimal shape — anything with an id + display name works.
export type DepartmentPickOption = { id: string; name: string };

export function DepartmentSelect({
  id,
  value,
  onChange,
  departments,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  departments: DepartmentPickOption[];
}) {
  const label = (deptId: unknown) => {
    const d = departments.find((x) => x.id === deptId);
    return d ? d.name : "Select a department";
  };

  return (
    <Select value={value} onValueChange={(v) => onChange((v as string) ?? "")}>
      {/* size="lg" matches the 40px text inputs beside it. Use the prop, not a
          height class: the trigger sets its height as data-[size=…]:h-N, which
          tailwind-merge does not treat as conflicting with a plain h-10, so a
          className would be out-specified and silently ignored. */}
      <SelectTrigger size="lg" id={id} className="w-full">
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
