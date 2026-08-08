"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

// Wraps @base-ui/react/tabs. Replaces the hand-rolled segmented rows that had
// appeared three times (the login staff/student toggle, the working-Saturday
// weekday picker, the faculty role filter) — each with its own `aria-pressed`
// or `role="radiogroup"` wiring and its own active-pill classes.
//
// The behaviour those copies were missing is keyboard support: real tabs move
// with arrow keys and expose the selected state to assistive tech. Base UI owns
// that; this file only dresses it.
//
// TWO VARIANTS, and they mean different things:
//   `segmented` — picking a MODE for the thing in front of you (sign in as
//     staff or student; which weekday a Saturday follows). Reads as one control.
//   `underline` — switching between VIEWS of a page. Reads as navigation.

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  variant = "segmented",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  variant?: "segmented" | "underline"
}) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        // `group/list` is what lets a trigger react to the list's variant.
        "group/list relative inline-flex items-center",
        variant === "segmented" && "h-9 gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
        variant === "underline" && "h-auto gap-4 border-b border-border",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // z-10 keeps the label above the sliding indicator, which is painted
        // behind it rather than around it.
        "relative z-10 inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-selected:text-foreground [&_svg]:size-4",
        // Underline tabs sit ON the rule rather than inside a track, so they
        // are taller and square.
        "group-data-[variant=underline]/list:h-9 group-data-[variant=underline]/list:rounded-none group-data-[variant=underline]/list:px-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * The sliding highlight. Base UI supplies `--active-tab-width` /
 * `--active-tab-left`, so the movement is CSS rather than measurement in JS.
 * Optional — omit it and the selected tab still reads via `data-selected`.
 */
function TabsIndicator({
  className,
  variant = "segmented",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Indicator> & {
  variant?: "segmented" | "underline"
}) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      className={cn(
        // `left-0` is the fix for a 4px drift, not decoration. Without an explicit
        // inset the absolutely-positioned indicator is placed at its STATIC
        // position — after the list's `p-1` padding — and then
        // `--active-tab-left` (which Base UI measures from the same padding box)
        // shifts it by that padding a second time. The white pill sat 4px right
        // of the tab it was highlighting, clipping "Staff" at the segment edge.
        "absolute left-0 z-0 w-(--active-tab-width) translate-x-(--active-tab-left) transition-all duration-150",
        variant === "segmented" && "top-1 h-7 rounded-md bg-card shadow-xs",
        variant === "underline" && "bottom-0 h-0.5 rounded-none bg-primary",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Panel>) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsIndicator, TabsContent }
