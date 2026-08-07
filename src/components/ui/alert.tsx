import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// The message block that reports an outcome — a failed mutation, a warning
// about what a destructive action will take with it, a note about why a screen
// is read-only.
//
// The `destructive` variant reproduces, to the class, the paragraph that was
// copy-pasted 38 times across 26 files (`border-destructive/30 bg-destructive/5
// text-destructive`). That is deliberate: this replaced those call sites, and
// an appearance change and a mechanical refactor should never land together.
//
// ARIA — the one part of this component that is behaviour, not style:
//   `alert`  is an ASSERTIVE live region. It interrupts a screen reader
//            mid-sentence. Correct for "your save failed", hostile for anything
//            the user did not just cause.
//   `status` is POLITE — announced at the next natural pause.
// So `destructive` defaults to `alert` and everything else to `status`. Passing
// an explicit `role` overrides both. Getting this backwards is not a visual
// regression, it is a change in how urgently the app shouts at people.
//
// LAYOUT CONTRACT: children must be ELEMENTS, not bare text. The grid puts an
// optional leading icon in a zero-width first column and everything else in the
// second via `col-start-2`; a bare text node has no class to carry that, so it
// would land in the 0px column and spill. Wrap content in <AlertDescription>
// (which is what <FormError> does for its callers).
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-3 py-2.5 text-sm has-[>svg]:grid-cols-[calc(--spacing(4))_1fr] has-[>svg]:gap-x-2.5 [&>svg]:size-4 [&>svg]:translate-y-0.5",
  {
    variants: {
      variant: {
        default:
          "border-border bg-card text-card-foreground [&>svg]:text-muted-foreground",
        destructive:
          "border-destructive/30 bg-destructive/5 text-destructive [&>svg]:text-destructive",
        warning:
          "border-warning-border/60 bg-warning-surface text-warning [&>svg]:text-warning",
        success:
          "border-success-border/60 bg-success-surface text-success [&>svg]:text-success",
        info: "border-info-border/60 bg-info-surface text-info [&>svg]:text-info",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Alert({
  className,
  variant,
  role,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={role ?? (variant === "destructive" ? "alert" : "status")}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 font-medium leading-snug", className)}
      {...props}
    />
  )
}

// Note there is no `opacity-90` here, which upstream shadcn does apply. The
// destructive variant is the one this component exists to serve, and dimming
// error text on a tinted surface costs contrast for no gain.
function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 text-sm [&_p]:leading-relaxed", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, alertVariants }
