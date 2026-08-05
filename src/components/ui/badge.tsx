import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// The status pill, named once. Before this, the same span was hand-written in
// ten places — six byte-identical "Active / Inactive" copies in the structure
// managers, two account-lifecycle variants, and a scattering of one-offs — each
// hardcoding `bg-emerald-500/10 text-emerald-600`, which is a raw Tailwind
// colour and so ignored the theme entirely.
//
// The variants split into two families on purpose:
//
//   BRAND-NEUTRAL INTENT (success / warning / info / destructive) — "this record
//     is live", "this needs attention". Backed by the --success/--warning/--info
//     tokens, which are deliberately not derived from --brand-hue: they encode
//     meaning, so they must stay green and amber even if the brand becomes
//     green or amber.
//
//   ATTENDANCE (present / absent / od / excused) — the four fixed statuses, in
//     their tinted form. The solid --status-* pairs stay for the marking grid's
//     filled buttons; these are for reporting a status rather than setting one.
//
// Never pass a raw colour through className. If a badge needs a colour that
// isn't here, the answer is a new token, not a literal.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border whitespace-nowrap font-medium transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        success: "border-success-border/60 bg-success-surface text-success",
        warning: "border-warning-border/60 bg-warning-surface text-warning",
        info: "border-info-border/60 bg-info-surface text-info",
        destructive:
          "border-destructive-border/60 bg-destructive-surface text-destructive",
        present:
          "border-transparent bg-status-present-surface text-status-present-ink",
        absent:
          "border-transparent bg-status-absent-surface text-status-absent-ink",
        od: "border-transparent bg-status-od-surface text-status-od-ink",
        excused:
          "border-transparent bg-status-excused-surface text-status-excused-ink",
      },
      size: {
        default: "h-5.5 px-2 text-xs",
        sm: "h-5 px-1.5 text-[0.6875rem]",
        // The "system voice" the structure managers already used for status:
        // mono, uppercase, wide-tracked. Kept so those screens read the same.
        code: "eyebrow h-5 px-2",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  }
)

function Badge({
  className,
  variant,
  size,
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Leading filled circle — the treatment the structure managers used. */
    dot?: boolean
  }) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-current opacity-70"
        />
      ) : null}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
