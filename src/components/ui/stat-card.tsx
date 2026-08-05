import * as React from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"

// The KPI tile. Replaces the bare `rounded-xl border bg-card p-5` + label +
// text-3xl blocks the dashboards hand-rolled.
//
// `value` is React.ReactNode and is rendered as given — this component never
// formats. Number formatting is a locale decision (this is an Indian college;
// "1,07,500" and "107,500" are both wrong somewhere) and belongs with the code
// that knows what the number means.
//
// `tabular-nums` is the small detail that makes a row of these feel solid: with
// proportional figures a 1 is narrower than a 7, so a live-updating count
// visibly jitters as digits change.
function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  tone?: "default" | "success" | "warning" | "destructive"
  /** Renders the whole tile as a link. Only pass a route the viewer can reach. */
  href?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&>svg]:size-4">
            <Icon />
          </span>
        ) : null}
      </div>
      <span
        data-tone={tone}
        className="font-heading text-3xl font-semibold leading-none tabular-nums text-foreground data-[tone=destructive]:text-destructive data-[tone=success]:text-success data-[tone=warning]:text-warning"
      >
        {value}
      </span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </>
  )

  const classes = cn(
    "flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow",
    href && "hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    className
  )

  if (href) {
    return (
      <Link href={href} data-slot="stat-card" className={classes}>
        {body}
      </Link>
    )
  }

  return (
    <div data-slot="stat-card" className={classes} {...props}>
      {body}
    </div>
  )
}

/** The standard KPI row. Wraps to 2-up on tablets, 1-up on phones. */
function StatCardGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stat-card-grid"
      className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}
      {...props}
    />
  )
}

export { StatCard, StatCardGrid }
