// The pager under a table. Two screens had this markup inline: students (server
// paginated) and faculty (client slice of a loaded list).
//
// ⚠️ IT TAKES NUMBERS AND CALLBACKS, NEVER STATE. That is the whole design.
//
// The students screen keeps a subtle invariant: server-side pagination does not
// clamp itself, so asking for page 10 of a 3-page result returns nothing. The
// stored `page` is treated as a REQUEST and the effective page is derived at
// render (`Math.min(page, pageCount)`), deliberately not corrected in an effect
// — a correcting effect costs an extra render and can cascade. If this
// component owned the page number it would have to re-implement that rule, and
// the version it re-implemented would eventually drift from the real one.
//
// `disabled` exists for TanStack Query's `isPlaceholderData`: while the next
// page is in flight the old rows stay on screen, and the buttons must not queue
// up a second jump.
"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TablePagination({
  page,
  pageCount,
  total,
  rangeStart,
  rangeEnd,
  onPageChange,
  disabled = false,
  noun = "records",
  className,
}: {
  /** The EFFECTIVE page (already clamped by the caller), 1-based. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based index of the first row shown. */
  rangeStart: number;
  /** 1-based index of the last row shown. */
  rangeEnd: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  /** Plural noun for the count, e.g. "students". */
  noun?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <span>
        Showing <span className="font-medium text-foreground tabular-nums">{rangeStart}</span>–
        <span className="font-medium text-foreground tabular-nums">{rangeEnd}</span> of{" "}
        <span className="font-medium text-foreground tabular-nums">{total}</span> {noun}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || disabled}
        >
          Previous
        </Button>
        <span className="font-mono text-xs tabular-nums">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount || disabled}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
