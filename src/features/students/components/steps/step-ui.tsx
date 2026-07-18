// Shared building blocks for the admission wizard steps — the section frame,
// labelled field, and the two select flavours (enum options vs lookup rows).
// Kept here so every step renders identical form furniture.
"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

export function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {!optional && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </Label>
        {optional && <span className="text-[0.7rem] text-muted-foreground">Optional</span>}
      </div>
      {children}
    </div>
  );
}

export function EnumSelect({
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
        <SelectValue placeholder={placeholder}>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LookupSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select",
  emptyLabel = "None available",
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; name: string }>;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const label = (v: unknown) => options.find((o) => o.id === v)?.name ?? placeholder;
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange((v as string) ?? "")}
      disabled={disabled || options.length === 0}
    >
      <SelectTrigger id={id} className="h-10! w-full">
        <SelectValue placeholder={options.length ? placeholder : emptyLabel}>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// A save row shared by every step: submit button, saved/error feedback.
export function SaveBar({
  pending,
  saved,
  error,
  label = "Save",
  disabled,
}: {
  pending: boolean;
  saved: boolean;
  error: unknown;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <>
      {error != null && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error instanceof Error ? error.message : "Couldn’t save."}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || disabled}>
          {pending ? "Saving…" : label}
        </Button>
        {saved && <span className="text-sm text-status-present-foreground">Saved.</span>}
      </div>
    </>
  );
}
