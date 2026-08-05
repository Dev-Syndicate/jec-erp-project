import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// WHY THIS HAS SIZES NOW — the `h-10!` story.
//
// The base used to hardcode `h-8`, and 78 call sites overrode it with
// `className="h-10!"`. That bang was only ever necessary once: SelectTrigger
// sets its height as `data-[size=default]:h-8`, which tailwind-merge does NOT
// recognise as conflicting with a plain `h-10`, and which out-specifies it — so
// a Select really did need `!` to be resized. Input never did (twMerge strips a
// plain `h-8` from the base when the caller passes `h-10`), but the workaround
// was copied from the Select onto every Input beside it.
//
// A named size replaces the override: `size="lg"` is the 40px field the forms
// were reaching for, `default` is 36px and lines up with Button's `default`,
// and `sm` is 28px for the dense marks and attendance grids.
//
// The `Omit<…, "size">` is load-bearing: `size` is a real HTML attribute on
// <input> (character width), so the variant prop shadows it. Nothing in this
// codebase uses the native one — verified — but without the Omit the two
// declarations collide and tsc fails.
const inputVariants = cva(
  "w-full min-w-0 rounded-lg border border-input bg-transparent text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      size: {
        sm: "h-7 px-2 py-0.5",
        default: "h-9 px-3 py-1",
        lg: "h-10 px-3 py-2",
      },
    },
    defaultVariants: { size: "default" },
  }
)

function Input({
  className,
  type,
  size,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
