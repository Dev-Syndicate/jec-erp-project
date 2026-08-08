"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { inputVariants } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// A calendar field that speaks the same language as `<input type="date">`: the
// value in and out is a plain `yyyy-mm-dd` string, which is what every form in
// this app keeps in state and posts to the API. That makes it a drop-in swap
// with no change to submit handlers.
//
// WHY NOT the native input — for a date of BIRTH the browser picker opens on
// the current month, so recording a student born in 2007 means paging back
// ~220 months. `captionLayout="dropdown"` puts month and year dropdowns in the
// caption, so the birth year is one click away.
//
// Dates are parsed and formatted from LOCAL parts on purpose. `new Date("2007-05-02")`
// is parsed as UTC, which in India (UTC+5:30) renders as the 2nd but in a
// negative-offset zone lands on the 1st — an off-by-one-day bug on real records.

// Year bounds for a date picked around the present — attendance for a given
// day, a leave request, a working Saturday. Wide enough to cross an academic
// year boundary in either direction, unlike the 80-year default a DOB needs.
// Functions, not constants, so a tab left open overnight is not stuck on a
// stale year.
export const sessionFromYear = () => new Date().getFullYear() - 1;
export const sessionToYear = () => new Date().getFullYear() + 1;

/** `yyyy-mm-dd` → Date at local midnight, or undefined when unset/malformed. */
function parseDateInput(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  // Rejects impossible dates that would otherwise roll over (2007-02-31).
  return date.getMonth() === Number(mo) - 1 ? date : undefined;
}

/** Date → `yyyy-mm-dd`, read off local parts (never `toISOString`). */
function formatDateInput(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Display form, matching the dd-mm-yyyy the native input showed here. */
function formatDisplay(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getDate())}-${p(date.getMonth() + 1)}-${date.getFullYear()}`;
}

export function DateField({
  id,
  value,
  onChange,
  required,
  disabled,
  placeholder = "dd-mm-yyyy",
  fromYear,
  toYear,
  min,
  max,
  disabledDayOfWeek,
  defaultMonth,
  className,
}: {
  id?: string;
  /** `yyyy-mm-dd`, or "" when unset. */
  value: string;
  /** Emits `yyyy-mm-dd`, or "" when cleared. */
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Earliest selectable year. Defaults to 80 years ago — covers any DOB. */
  fromYear?: number;
  /** Latest selectable year. Defaults to the current year. */
  toYear?: number;
  /** `yyyy-mm-dd` lower bound, mirroring the native input's `min`. */
  min?: string;
  /** `yyyy-mm-dd` upper bound, mirroring the native input's `max`. */
  max?: string;
  /** Weekdays to grey out, as `0`=Sunday … `6`=Saturday. */
  disabledDayOfWeek?: number[];
  /**
   * `yyyy-mm-dd` the calendar opens on while nothing is selected. Use it when
   * the useful month is not the default one — a working-Saturday picker opens
   * on the next Saturday rather than on January of the last allowed year.
   */
  defaultMonth?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDateInput(value);

  // Computed per render rather than per module so a long-lived tab does not
  // pin a stale "current year".
  const thisYear = new Date().getFullYear();
  const startYear = fromYear ?? thisYear - 80;
  const endYear = toYear ?? thisYear;

  // `min`/`max` are the real constraint (e.g. a leave "To" date cannot precede
  // "From"); the year range only bounds the dropdowns. Disabling the days keeps
  // the picker honest instead of relying on the server to reject the range.
  const minDate = min ? parseDateInput(min) : undefined;
  const maxDate = max ? parseDateInput(max) : undefined;
  const disabledDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
    ...(disabledDayOfWeek?.length ? [{ dayOfWeek: disabledDayOfWeek }] : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        // `required` can't apply to a button, so the constraint is surfaced to
        // assistive tech instead; the parent form validates on the value.
        aria-required={required}
        className={cn(
          inputVariants({ size: "lg" }),
          "flex items-center justify-between gap-2 text-left",
          !selected && "text-muted-foreground",
          className
        )}
      >
        <span className="truncate">{selected ? formatDisplay(selected) : placeholder}</span>
        <CalendarIcon className="size-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          // Opens on the selected date when editing, then on an explicit
          // defaultMonth, then on the lower bound if one is set (a "To" date
          // opens at "From"), else on the last allowed year — so a DOB starts
          // near the plausible range, not on today.
          defaultMonth={
            selected ??
            (defaultMonth ? parseDateInput(defaultMonth) : undefined) ??
            minDate ??
            new Date(endYear, 0)
          }
          captionLayout="dropdown"
          startMonth={new Date(startYear, 0)}
          endMonth={new Date(endYear, 11)}
          disabled={disabledDays.length ? disabledDays : undefined}
          autoFocus
          onSelect={(date) => {
            onChange(date ? formatDateInput(date) : "");
            if (date) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
