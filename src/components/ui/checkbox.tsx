import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Wraps @base-ui/react/checkbox. Replaces the raw `<input type="checkbox">`
// controls on the promotion screen, which relied on `accent-primary` — a
// property browsers style inconsistently and which cannot show the third state
// this app actually needs.
//
// `indeterminate` is the reason this exists rather than a styled input: a
// select-all header box has three states, not two (none / some / all), and
// "some" is only expressible through the DOM property, never an attribute.
// Base UI owns that, and renders a dash instead of a tick for it.
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // `inline-flex` is load-bearing, not alignment sugar. Base UI renders
        // this Root as a <span>, which is display:inline by default — and an
        // inline box IGNORES width and height, so `size-4` did nothing and the
        // control stretched to whatever the line box was. In a table row that
        // meant a 28x54 sliver instead of a 16px square, which read as a stray
        // vertical bar beside every name. It also centres the tick, which the
        // Indicator's own flex could not do from inside an inline parent.
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-transparent align-middle shadow-2xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            {state.indeterminate ? (
              <MinusIcon className="size-3.5" />
            ) : (
              <CheckIcon className="size-3.5" />
            )}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
