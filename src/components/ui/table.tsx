"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// The app had two table implementations: this one (9 screens) and a hand-rolled
// `<table>` recipe (13 screens) that wrapped itself in
// `overflow-x-auto rounded-xl ring-1 ring-foreground/10` and styled its own
// `<thead>`. `containerClassName` is what lets those migrate here: Table
// already renders its OWN scroll container, so the old wrapper could not simply
// be kept around it — nesting two `overflow-x-auto` divs gives you two scroll
// bars and clips the inner one at the ring's radius. Now the frame classes go
// on the container Table already owns.
function Table({
  className,
  containerClassName,
  density = "default",
  ...props
}: React.ComponentProps<"table"> & {
  /** Frame classes for the scroll container — usually the ring + radius. */
  containerClassName?: string
  /** `compact` tightens cells for dense editable grids (marks, attendance). */
  density?: "default" | "compact"
}) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", containerClassName)}
    >
      <table
        data-slot="table"
        data-density={density}
        // `border-collapse` is explicit because every cell separator in this app
        // is a `border-b` on the row; under the default `separate` model those
        // double up by a pixel where rows meet.
        className={cn(
          "group/table w-full caption-bottom border-collapse text-sm",
          className
        )}
        {...props}
      />
    </div>
  )
}

// `sticky` is OPT-IN and must stay that way. It does nothing inside a plain
// `overflow-x-auto` with no bounded height, and inside a DialogContent — which
// is itself the scroll container and already pins its own header at
// `sticky -top-4` — the two fight and the table header floats over the title.
function TableHeader({
  className,
  sticky = false,
  ...props
}: React.ComponentProps<"thead"> & { sticky?: boolean }) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b [&_tr]:hover:bg-transparent",
        sticky &&
          "sticky top-0 z-10 [&_th]:bg-muted/60 shadow-[0_1px_0_0_var(--border)]",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

// Header ink is muted and small rather than full-strength foreground: in a
// dense ERP table the column names are reference, not content, and letting them
// compete with the data is what made these screens feel noisy. This also
// matches what the 13 hand-rolled tables were already doing by setting
// `text-muted-foreground` on their header row.
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground group-data-[density=compact]/table:h-8 group-data-[density=compact]/table:px-2 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2.5 align-middle whitespace-nowrap group-data-[density=compact]/table:px-2 group-data-[density=compact]/table:py-1.5 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

// The in-table empty row. `hover:bg-transparent` matters — without it the "no
// results" message highlights on hover as though it were a selectable record,
// and `whitespace-normal` undoes TableCell's nowrap so a sentence can wrap.
function TableEmpty({
  colSpan,
  className,
  ...props
}: React.ComponentProps<"td"> & { colSpan: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={colSpan}
        className={cn(
          "h-24 whitespace-normal px-3 text-center text-sm text-muted-foreground",
          className
        )}
        {...props}
      />
    </TableRow>
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableEmpty,
  TableCaption,
}
