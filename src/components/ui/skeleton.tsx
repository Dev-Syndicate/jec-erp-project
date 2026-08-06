import { cn } from "@/lib/utils"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

// Bar widths cycle rather than repeat, so a column of placeholders reads as
// "rows of text" instead of a barcode. Deterministic on purpose: a random width
// would differ between the server and client render and hydrate-mismatch.
const CELL_WIDTHS = ["w-24", "w-32", "w-20", "w-28", "w-16", "w-36"]

/**
 * A table-shaped placeholder. Use where the loaded shape is genuinely known —
 * a list of N rows by M columns — so the real content lands in the space the
 * skeleton was already holding.
 *
 * NOT for a region whose pending state competes with other outcomes. The
 * attendance report, for instance, branches six ways and two of those arms ask
 * the user to pick a class; a skeleton there promises rows that will never
 * arrive on their own. Those keep <LoadingState>.
 */
function TableSkeleton({
  rows = 6,
  cols = 5,
  label = "Loading…",
  className,
}: {
  rows?: number
  cols?: number
  /** Announced to assistive tech. The bars themselves are hidden from it. */
  label?: string
  className?: string
}) {
  return (
    // The status wrapper lives HERE rather than at each call site, so a screen
    // reader always hears "Loading students…" and never a table of empty cells.
    // Leaving it to each caller is exactly the kind of thing that gets forgotten.
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Table
        aria-hidden
        containerClassName={cn("rounded-xl bg-card ring-1 ring-foreground/10", className)}
      >
        <TableHeader>
          <TableRow>
            {Array.from({ length: cols }, (_, c) => (
              <TableHead key={c}>
                <Skeleton className="h-3 w-16" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, r) => (
            <TableRow key={r} className="hover:bg-transparent">
              {Array.from({ length: cols }, (_, c) => (
                <TableCell key={c}>
                  <Skeleton className={cn("h-4", CELL_WIDTHS[(r + c) % CELL_WIDTHS.length])} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * Card-shaped placeholders — `count` cards of a title bar plus `lines` rows.
 * For screens that load into a grid of cards rather than a table (academic
 * years, RBAC roles).
 */
function CardSkeleton({
  count = 3,
  lines = 3,
  label = "Loading…",
  className,
}: {
  count?: number
  lines?: number
  label?: string
  className?: string
}) {
  return (
    <div role="status" aria-busy="true" className={cn("grid gap-3 md:grid-cols-2", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, card) => (
        <div
          key={card}
          aria-hidden
          className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10"
        >
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: lines }, (_, i) => (
            <Skeleton key={i} className={cn("h-3", CELL_WIDTHS[(card + i) % CELL_WIDTHS.length])} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** A row of StatCard placeholders, matching StatCardGrid's columns. */
function StatCardSkeleton({
  count = 3,
  label = "Loading…",
}: {
  count?: number
  label?: string
}) {
  return (
    <div role="status" aria-busy="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
        >
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  )
}

export { Skeleton, TableSkeleton, CardSkeleton, StatCardSkeleton }
