import * as React from "react"

import { cn } from "@/lib/utils"

// Base UI has no textarea part, so this is the native element — but it carries
// the SAME focus and invalid treatment as Input, which the two hand-rolled
// textareas it replaces did not: they focused with `ring-2 ring-sidebar-ring`,
// a sidebar token that had drifted in by copy-paste and rendered a visibly
// different focus ring from every other field on the same form.
//
// `field-sizing-content` grows the box with what is typed (a leave reason is
// usually one line and occasionally five) while `min-h-16` keeps it from
// collapsing to a single row when empty and looking like a text input.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content min-h-16 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
