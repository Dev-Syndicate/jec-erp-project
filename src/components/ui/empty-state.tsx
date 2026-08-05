import * as React from "react"

import { cn } from "@/lib/utils"

// The "there is nothing here" panel. Nine hand-rolled copies of
// `rounded-xl border border-dashed border-border py-16 text-center` existed
// before this, and they came in two shapes that mean genuinely different things:
//
//   size="default" — NOTHING EXISTS YET. The table is empty because nobody has
//     created anything. Gets an icon, a description and an `action` (the CTA
//     that creates the first one), because the useful next step is obvious.
//
//   size="sm" — NOTHING MATCHES. There is data, but the current search or
//     filters exclude all of it. Deliberately quieter: no icon, no CTA — the
//     next step is to change the filter, which is already on screen, and
//     offering "Add a student" here would be answering a question nobody asked.
//
// Keeping both in one component is what stops the distinction from eroding.
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "default",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  /** Usually a <Button>. Ignored by convention on size="sm". */
  action?: React.ReactNode
  size?: "default" | "sm"
}) {
  return (
    <div
      data-slot="empty-state"
      data-size={size}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center data-[size=sm]:gap-2 data-[size=sm]:px-4 data-[size=sm]:py-10",
        className
      )}
      {...props}
    >
      {Icon ? (
        <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground [&>svg]:size-5">
          <Icon />
        </div>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
