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
    // Centred in whatever space it is given, rather than left as a bare line of
    // text. It used to be a plain <p>, so on a page whose ONLY content is this
    // (the profile, a report before a class is picked) it stranded itself in the
    // top-left corner of an otherwise empty panel and read like a stray caption.
    //
    // `min-h-32` is the floor so it reads as a region rather than a stray line.
    // Growing to fill a page is NOT decided here: PageShell stretches a trailing
    // placeholder via `data-slot`, so one that sits above a table stays its own
    // size. Callers can still override the layout via className, which twMerge
    // lets win.
    <div
      role="status"
      aria-busy="true"
      data-slot="loading-state"
      className={cn(
        "flex min-h-32 items-center justify-center gap-2 py-8 text-sm text-muted-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/60"
      />
      {label}
    </div>
  );
}
