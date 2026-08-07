// Form layout primitives: a labelled field, and a titled group of them.
//
// LAYOUT ONLY — deliberately. Every form in this app is `useState` per field
// with a `const valid = …` computed at render and a submit button that disables
// until it passes. That is a working pattern and these components do not touch
// it: no validation, no registration, no form context. They render a label, a
// control and an optional message, and that is all.
//
// The reason to resist more: introducing a form library here would mean
// rewriting the submit path of twenty dialogs, and the submit paths carry real
// rules (identity fields sent only when changed, roles guarded on load). Those
// are worth keeping exactly as they are.
"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FormField({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  /** Must match the control's own id, or the label won't focus it. */
  id?: string;
  label: React.ReactNode;
  /** Quiet helper text, shown when there is no error. */
  hint?: React.ReactNode;
  /** Replaces the hint when present, and colours the row. */
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          // aria-hidden because the asterisk is a sighted-user convention; the
          // control itself carries `required`, which is what a screen reader
          // announces. Without this the field is read as "Name star".
          <span aria-hidden className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * A titled group of fields inside a long form.
 *
 * The student and faculty dialogs ask for fifteen-plus values across identity,
 * contact and placement. As one flat grid that is a wall; split into named
 * sections it becomes three short questions. `columns` controls the inner grid
 * so a section of short fields can sit 2- or 3-up while a section of long ones
 * stays stacked.
 */
export function FormSection({
  title,
  description,
  columns = 1,
  className,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-0.5">
        <h3 className="eyebrow text-muted-foreground">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div
        className={cn(
          "grid gap-4",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** A horizontal rule between form sections. Purely visual. */
export function FormSectionDivider({ className }: { className?: string }) {
  return <hr className={cn("border-border", className)} />;
}
