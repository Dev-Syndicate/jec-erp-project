// The Students list filter bar.
//
// ROLE-AWARENESS IS PRESENTATION ONLY. Access is decided server-side: the list
// route ANDs every filter with the caller's own program scope, so a scoped role
// (HOD) receives only their program's students no matter what is sent. What
// varies here is which CONTROLS are worth showing:
//
//   Super Admin (institution-scoped) — spans every program, so the Program
//                                      filter is meaningful. Full set.
//   HOD / program-scoped staff       — exactly one program, so a Program
//                                      dropdown would be a one-entry no-op.
//                                      Hidden; the rest of the set stays.
//
// Hiding a redundant control is a usability call, not a security boundary —
// never treat it as one.
"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/features/students/components/form-select";
import type { ProgramOption, StudentFilters } from "@/features/students/types";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "GRADUATED", label: "Graduated" },
  { value: "DROPPED", label: "Dropped" },
  { value: "TRANSFERRED", label: "Transferred" },
];

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

// "" is the cleared state for every select, so each list carries an "All" row.
const all = (label: string, options: Array<{ value: string; label: string }>) => [
  { value: "", label },
  ...options,
];

export function StudentFilterBar({
  filters,
  onChange,
  programs,
  classes,
  showProgram,
}: {
  filters: StudentFilters;
  onChange: (next: StudentFilters) => void;
  programs: ProgramOption[];
  classes: Array<{ programId: string; year: number; section: string }>;
  /** Super Admin only — a scoped role has a single program (see file header). */
  showProgram: boolean;
}) {
  const set = <K extends keyof StudentFilters>(key: K, value: StudentFilters[K]) => {
    const next = { ...filters, [key]: value };
    // Drop cleared keys so the query key (and the URL) stay tidy.
    if (value === undefined || value === "") delete next[key];
    // Sections differ per year, so changing the year clears a stale section.
    if (key === "year") delete next.section;
    onChange(next);
  };

  // Year/section options come from the classes that actually exist, narrowed to
  // the chosen program — so we never offer a year with no class behind it.
  const inProgram = filters.programId
    ? classes.filter((c) => c.programId === filters.programId)
    : classes;
  const years = [...new Set(inProgram.map((c) => c.year))].sort((a, b) => a - b);
  const sections = [
    ...new Set(
      inProgram.filter((c) => !filters.year || c.year === filters.year).map((c) => c.section),
    ),
  ].sort();

  const activeCount = Object.keys(filters).length;

  return (
    <div className="flex flex-wrap items-end gap-3">
      {showProgram && (
        <div className="flex min-w-44 flex-col gap-1.5">
          <Label htmlFor="sf-program" className="text-xs text-muted-foreground">
            Program
          </Label>
          <FormSelect
            id="sf-program"
            value={filters.programId ?? ""}
            onChange={(v) => {
              // A program change invalidates the class-derived choices below.
              const next: StudentFilters = { ...filters, programId: v || undefined };
              if (!v) delete next.programId;
              delete next.year;
              delete next.section;
              onChange(next);
            }}
            options={all(
              "All programs",
              programs.map((p) => ({ value: p.id, label: p.label })),
            )}
            placeholder="All programs"
          />
        </div>
      )}

      <div className="flex min-w-32 flex-col gap-1.5">
        <Label htmlFor="sf-year" className="text-xs text-muted-foreground">
          Year
        </Label>
        <FormSelect
          id="sf-year"
          value={filters.year ? String(filters.year) : ""}
          onChange={(v) => set("year", v ? Number(v) : undefined)}
          options={all(
            "All years",
            years.map((y) => ({ value: String(y), label: `Year ${y} (${ROMAN[y] ?? y})` })),
          )}
          placeholder="All years"
        />
      </div>

      <div className="flex min-w-32 flex-col gap-1.5">
        <Label htmlFor="sf-section" className="text-xs text-muted-foreground">
          Section
        </Label>
        <FormSelect
          id="sf-section"
          value={filters.section ?? ""}
          onChange={(v) => set("section", v || undefined)}
          options={all(
            "All sections",
            sections.map((s) => ({ value: s, label: `Section ${s}` })),
          )}
          placeholder="All sections"
        />
      </div>

      <div className="flex min-w-36 flex-col gap-1.5">
        <Label htmlFor="sf-status" className="text-xs text-muted-foreground">
          Status
        </Label>
        <FormSelect
          id="sf-status"
          value={filters.status ?? ""}
          onChange={(v) => set("status", (v || undefined) as StudentFilters["status"])}
          options={all("All statuses", STATUS_OPTIONS)}
          placeholder="All statuses"
        />
      </div>

      <div className="flex min-w-32 flex-col gap-1.5">
        <Label htmlFor="sf-gender" className="text-xs text-muted-foreground">
          Gender
        </Label>
        <FormSelect
          id="sf-gender"
          value={filters.gender ?? ""}
          onChange={(v) => set("gender", (v || undefined) as StudentFilters["gender"])}
          options={all("All genders", GENDER_OPTIONS)}
          placeholder="All genders"
        />
      </div>

      {activeCount > 0 && (
        <Button variant="ghost" className="h-10!" onClick={() => onChange({})}>
          Clear{activeCount > 1 ? ` (${activeCount})` : ""}
        </Button>
      )}
    </div>
  );
}
