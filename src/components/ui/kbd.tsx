import * as React from "react"

import { cn } from "@/lib/utils"

// A keyboard key. Small, but it earns a component because tooltip.tsx already
// styles `has-data-[slot=kbd]` — the hook was written before the component was.
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 select-none items-center justify-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[0.65rem] font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
