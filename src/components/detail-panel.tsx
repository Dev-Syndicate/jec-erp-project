// The building blocks of a detail view: an identity summary, and titled blocks
// of label/value rows.
//
// This is the layout the reference dashboards use for a person — content on the
// left, a summary panel on the right — and it did not exist anywhere in the app.
// The pieces were invented once inside profile-view.tsx and used nowhere else,
// so they are lifted here to be shared with any future student or faculty
// detail view.
//
// Read-only by design. Editing a person happens in their own dialog, where the
// server rules about which fields are login handles apply; a detail view that
// quietly edited would have to duplicate those.
"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** First letters of up to two words — "Asha Kumar" → "AK". */
export function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "· ·"
  );
}

/**
 * One label/value row.
 *
 * An absent value renders as an em dash rather than collapsing, so the rows
 * stay aligned and "we don't hold this" is visibly different from a rendering
 * bug. The label is `w-40` at `sm` and up and stacked below it on a phone,
 * which is what keeps a 40-character value readable at 360px.
 */
export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="eyebrow w-40 shrink-0 text-[0.7rem] tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 text-sm break-words text-foreground">{value || "—"}</span>
    </div>
  );
}

/** A titled card of DetailRows. */
export function DetailSection({
  title,
  action,
  className,
  children,
}: {
  title: string;
  /** Optional control in the header — usually a Button. */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl bg-card ring-1 ring-foreground/10", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="font-heading text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="divide-y divide-border/60 px-5 py-1">{children}</div>
    </section>
  );
}

/**
 * The summary card: avatar, name, subtitle, role badges, and any actions.
 *
 * Sticky at `lg` and up so it stays beside the content while a long detail list
 * scrolls — that side-by-side persistence is the point of the pattern, and
 * without it the panel is just a card that happens to be first.
 */
export function DetailPanel({
  name,
  subtitle,
  badges,
  meta,
  actions,
  className,
}: {
  name: string;
  subtitle?: React.ReactNode;
  /** Usually role names. Rendered as Badges. */
  badges?: string[];
  /** Compact label/value pairs shown under the identity block. */
  meta?: Array<{ label: string; value: React.ReactNode }>;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 lg:sticky lg:top-20",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-sidebar-accent font-mono text-lg font-semibold text-sidebar-accent-foreground">
          {initialsOf(name)}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-heading text-lg font-semibold text-foreground">
            {name}
          </span>
          {subtitle ? (
            <span className="truncate text-sm text-muted-foreground">{subtitle}</span>
          ) : null}
        </div>
      </div>

      {badges?.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {badges.map((b) => (
            <Badge key={b} variant="secondary" size="code">
              {b}
            </Badge>
          ))}
        </div>
      ) : null}

      {meta?.length ? (
        <dl className="flex flex-col gap-2.5 border-t border-border pt-4">
          {meta.map((m) => (
            <div key={m.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">{m.label}</dt>
              <dd className="min-w-0 truncate text-right text-sm font-medium text-foreground">
                {m.value || "—"}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {actions ? <div className="flex flex-col gap-2 border-t border-border pt-4">{actions}</div> : null}
    </aside>
  );
}
