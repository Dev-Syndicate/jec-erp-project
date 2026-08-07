"use client";

import * as React from "react";
import { ResponsiveContainer, Tooltip as RTooltip } from "recharts";

import { cn } from "@/lib/utils";

// Thin wrapper around Recharts. Two jobs, both about keeping charts inside the
// design system rather than beside it.
//
// COLOURS COME FROM TOKENS, ALWAYS. Pass `fill="var(--chart-1)"` or
// `var(--status-present)` straight to a <Bar>/<Cell>. SVG presentation
// attributes are parsed by the CSS engine, so `var()` resolves natively on an
// SVG node — no getComputedStyle, no useEffect colour extraction, no re-render
// when the theme changes. Never a hex literal: the chart palette fans out from
// --brand-hue at 60° steps precisely so a brand change carries the charts with
// it. The attendance statuses are the exception that proves it — they use the
// fixed --status-* tokens because they encode meaning, not brand.
//
// SIZING. Recharts needs a pixel height; ResponsiveContainer only solves width.
// `height` is therefore required, and the container carries `min-w-0` because a
// flex/grid child defaults to min-width:auto and will refuse to shrink, which
// is the usual reason a "responsive" chart overflows its card on a phone.

export function ChartContainer({
  height,
  className,
  children,
  label,
}: {
  /** Pixel height. Recharts cannot infer one. */
  height: number;
  className?: string;
  children: React.ReactElement;
  /**
   * What the chart shows, for assistive tech. An SVG of bars is unreadable to a
   * screen reader, so every chart in this app is expected to sit beside a table
   * or list carrying the same numbers — this is the pointer to it.
   */
  label: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("min-w-0", className)}
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Tooltip styled as a small popover, matching Select/Dialog surfaces. */
export function ChartTooltip(props: React.ComponentProps<typeof RTooltip>) {
  return (
    <RTooltip
      cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
      contentStyle={{
        background: "var(--popover)",
        border: "none",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-md)",
        outline: "1px solid color-mix(in oklch, var(--foreground) 10%, transparent)",
        fontSize: "0.8125rem",
        padding: "0.5rem 0.625rem",
      }}
      labelStyle={{ color: "var(--muted-foreground)", marginBottom: "0.125rem" }}
      itemStyle={{ color: "var(--foreground)" }}
      {...props}
    />
  );
}

/** Shared axis styling — muted, small, no heavy rules. */
export const AXIS_PROPS = {
  stroke: "var(--border)",
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;
