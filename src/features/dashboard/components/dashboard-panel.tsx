// The card a dashboard chart or list sits in: a title row (with an optional hint
// and a link out to the screen that owns the detail) over the content.
//
// Separate from PageShell's TABLE_FRAME because a panel has a header inside the
// ring, and separate from the ui/ primitives because it is a dashboard idiom
// rather than a shared one — nothing outside this feature composes a titled
// chart card.
"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export function DashboardPanel({
  title,
  hint,
  href,
  hrefLabel = "View",
  className,
  bodyClassName,
  children,
}: {
  title: string;
  /** A short qualifier — the window a chart covers, the unit a list is in. */
  hint?: React.ReactNode;
  /** Only ever a route the viewer can reach; panels are rendered role-gated. */
  href?: string;
  hrefLabel?: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn("flex min-w-0 flex-col rounded-xl bg-card ring-1 ring-foreground/10", className)}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pb-3 pt-4">
        <div className="flex min-w-0 flex-col">
          <h2 className="font-heading text-sm font-semibold text-foreground">{title}</h2>
          {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {hrefLabel}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </header>
      <div className={cn("flex min-w-0 flex-1 flex-col px-4 pb-4", bodyClassName)}>{children}</div>
    </section>
  );
}
