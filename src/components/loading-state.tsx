// The "still fetching" placeholder.
//
// Every manager rendered a bare `<p className="text-sm text-muted-foreground">
// Loading students…</p>`. The text was fine; what was missing was that a screen
// reader had no way to know the region was busy, and a sighted user had no
// motion to distinguish "loading" from "this is just a sentence".
//
// Deliberately NOT a skeleton. Skeletons are right when the loaded shape is
// predictable — a table of N rows by M columns, which is what <TableSkeleton>
// is for. They are wrong where the pending state competes with other outcomes:
// on the attendance report, `isPending` is one arm of a six-way branch whose
// other arms include "pick a class first", and a skeleton there promises
// content that may never arrive.
"use client";

import { cn } from "@/lib/utils";

export function LoadingState({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <p
      role="status"
      aria-busy="true"
      className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/60"
      />
      {label}
    </p>
  );
}
