// The outer frame of an inner page: the gutter, the vertical rhythm, and the
// header row that pairs a PageHeader with its primary actions.
//
// Fourteen managers opened with a literal `<div className="flex flex-col gap-6
// p-6">` followed by a `<div className="flex items-start justify-between
// gap-4">`, and they had quietly drifted — one used `flex-wrap`, the dashboards
// used a centred `max-w-5xl` with different padding. Naming the frame is what
// keeps a new page from inventing a fifteenth variant.
//
// What it deliberately does NOT own: the loading / error / empty / content
// decision. Every screen branches on its own query state, and several branch on
// more than that — the attendance report picks between six outcomes including
// "choose a class first". A shell that took `isPending` and `isError` props
// would handle the simple screens and force the interesting ones to opt out,
// which is how a layout component starts lying. States are composed as children
// with <LoadingState>, <FormError> and <EmptyState>.
import type * as React from "react";

import { cn } from "@/lib/utils";

export function PageShell({
  children,
  className,
  width = "full",
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * `full` — the working screens: tables need every pixel.
   * `narrow` — reading screens (dashboards, profile) where a full-width line
   *   of prose would be uncomfortably long.
   */
  width?: "full" | "narrow";
}) {
  return (
    <div
      className={cn(
        // `flex-1` so the shell fills the scroll panel rather than shrinking to
        // its content. Nothing about a normal page changes — content-height and
        // full-height look identical once the page has content — but it gives a
        // lone child something to centre IN. Without it a <LoadingState> sat at
        // the top of an empty panel with acres of white below it.
        "flex flex-1 flex-col gap-6 p-4 sm:p-6",
        // A page whose ONLY content is a placeholder should centre it, not strand
        // it under the header with a screen of white below — the marks, roster,
        // report and timetable screens all open in exactly that state ("Pick a
        // subject to enter marks."). Targeting the LAST child is what keeps this
        // honest: a placeholder sitting above a table or beside filters is not
        // the whole page and must not stretch, so only a trailing one grows.
        // Written here rather than on 30 call sites so the rule cannot drift.
        "[&>[data-slot=empty-state]:last-child]:flex-1 [&>[data-slot=loading-state]:last-child]:flex-1",
        width === "narrow" && "mx-auto w-full max-w-5xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The title row: a <PageHeader> beside its actions.
 *
 * Wraps rather than truncates below `sm` — on a phone the actions drop under
 * the title instead of squeezing it, and `items-start` keeps a tall header
 * (eyebrow + title + description) aligned with the top of the button cluster
 * rather than centring the buttons against three lines of text.
 */
export function PageShellHeader({
  children,
  actions,
  className,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      {children}
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * The toolbar above a table: search on the left, filters and secondary controls
 * on the right. Separated from PageShellHeader because the page's primary
 * action ("New class") and the table's controls answer different questions and
 * shouldn't compete for the same row.
 */
export function TableToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      {children}
    </div>
  );
}

/**
 * The bordered surface a table sits in. This exact string
 * (`overflow-x-auto rounded-xl ring-1 ring-foreground/10`) was written out by
 * hand in ten places; pass it to <Table containerClassName={TABLE_FRAME}>.
 */
export const TABLE_FRAME = "rounded-xl bg-card ring-1 ring-foreground/10";
