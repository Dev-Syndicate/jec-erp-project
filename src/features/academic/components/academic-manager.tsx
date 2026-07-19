// Academic year & term management — Super Admin. Create academic years, add
// terms (semesters) to them, and activate exactly one year + one term. The
// active term is what assignments/timetable/attendance scope to. Activating a
// term also activates its year (see the API).
"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAcademicYears,
  useActivateTerm,
  useActivateYear,
  useCreateTerm,
  useCreateYear,
} from "@/features/academic/hooks/use-academic";
import type { AcademicYear, TermKind } from "@/features/academic/types";

export function AcademicManager() {
  const years = useAcademicYears();

  return (
    <div className="flex flex-col gap-8">
      <NewYearForm />

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">Academic years</h2>
        {years.isPending ? (
          <Panel>Loading…</Panel>
        ) : years.isError ? (
          <Panel>
            <span className="text-destructive">
              {years.error instanceof Error ? years.error.message : "Couldn’t load academic years."}
            </span>
          </Panel>
        ) : years.data.length === 0 ? (
          <Panel>No academic years yet. Create the first one above.</Panel>
        ) : (
          <div className="flex flex-col gap-4">
            {years.data.map((y) => (
              <YearCard key={y.id} year={y} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NewYearForm() {
  const create = useCreateYear();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const canSubmit = name.trim() && startDate && endDate && !create.isPending;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border p-5">
      <div>
        <h2 className="font-heading text-base font-semibold text-foreground">New academic year</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          e.g. “2025–2026”. Add its semesters below, then activate one.
        </p>
      </div>
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          create.mutate(
            { name: name.trim(), startDate, endDate },
            { onSuccess: () => { setName(""); setStartDate(""); setEndDate(""); } },
          );
        }}
      >
        <Field label="Name" htmlFor="y-name">
          <Input id="y-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="2025–2026" className="h-10" />
        </Field>
        <Field label="Start date" htmlFor="y-start">
          <Input id="y-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="h-10" />
        </Field>
        <Field label="End date" htmlFor="y-end">
          <Input id="y-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className="h-10" />
        </Field>
        {create.isError && (
          <p role="alert" className="sm:col-span-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {create.error instanceof Error ? create.error.message : "Couldn’t create the year."}
          </p>
        )}
        <div className="sm:col-span-3">
          <Button type="submit" disabled={!canSubmit}>
            {create.isPending ? "Creating…" : "Create year"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function YearCard({ year }: { year: AcademicYear }) {
  const activateYear = useActivateYear();

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ActiveDot active={year.isActive} />
          <span className="font-heading text-base font-semibold text-foreground">{year.name}</span>
          {year.isActive && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-primary">
              Active
            </span>
          )}
        </div>
        {!year.isActive && (
          <Button variant="outline" size="sm" disabled={activateYear.isPending} onClick={() => activateYear.mutate(year.id)}>
            Set active
          </Button>
        )}
      </div>

      <TermList year={year} />
    </div>
  );
}

function TermList({ year }: { year: AcademicYear }) {
  const activateTerm = useActivateTerm();

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          Semesters
        </span>
      </div>

      {year.terms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No semesters yet — add one below.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {year.terms.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-md px-1 py-1">
              <span className="flex items-center gap-2 text-sm text-foreground">
                <ActiveDot active={t.isActive} />
                {t.name}
                {t.isActive && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-primary">
                    Active
                  </span>
                )}
              </span>
              {!t.isActive && (
                <Button variant="ghost" size="sm" disabled={activateTerm.isPending} onClick={() => activateTerm.mutate(t.id)}>
                  Set active
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <NewTermForm yearId={year.id} takenKinds={year.terms.map((t) => t.kind)} />
    </div>
  );
}

const TERM_OPTIONS: Array<{ value: TermKind; label: string }> = [
  { value: "ODD", label: "Odd Semester" },
  { value: "EVEN", label: "Even Semester" },
];

function NewTermForm({ yearId, takenKinds }: { yearId: string; takenKinds: TermKind[] }) {
  const create = useCreateTerm();
  const [kind, setKind] = useState<TermKind | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [open, setOpen] = useState(false);

  // Only Odd/Even not yet added to this year.
  const available = TERM_OPTIONS.filter((o) => !takenKinds.includes(o.value));

  // Both sessions exist — nothing left to add.
  if (available.length === 0) return null;

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="mt-1 self-start" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add semester
      </Button>
    );
  }

  const canSubmit = kind && startDate && endDate && !create.isPending;

  return (
    <form
      className="mt-1 grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        if (!kind) return;
        create.mutate(
          { yearId, input: { kind, startDate, endDate } },
          { onSuccess: () => { setKind(""); setStartDate(""); setEndDate(""); setOpen(false); } },
        );
      }}
    >
      <Field label="Session" htmlFor={`t-kind-${yearId}`}>
        <Select value={kind} onValueChange={(v) => setKind((v as TermKind) ?? "")}>
          <SelectTrigger id={`t-kind-${yearId}`} className="h-9! w-full">
            <SelectValue placeholder="Odd / Even">
              {(v: unknown) => available.find((o) => o.value === v)?.label ?? "Odd / Even"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {available.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Start date" htmlFor={`t-start-${yearId}`}>
        <Input id={`t-start-${yearId}`} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="h-9" />
      </Field>
      <Field label="End date" htmlFor={`t-end-${yearId}`}>
        <Input id={`t-end-${yearId}`} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className="h-9" />
      </Field>
      {create.isError && (
        <p role="alert" className="sm:col-span-3 text-sm text-destructive">
          {create.error instanceof Error ? create.error.message : "Couldn’t add the semester."}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {create.isPending ? "Adding…" : "Add semester"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ActiveDot({ active }: { active: boolean }) {
  return active ? (
    <CheckCircle2 className="size-4 text-primary" />
  ) : (
    <Circle className="size-4 text-muted-foreground/40" />
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-6 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
