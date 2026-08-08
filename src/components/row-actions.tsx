// The per-row `⋯` menu for a table.
//
// It replaces rows of 2–3 inline ghost icon buttons. The buttons were not
// broken, but they had three problems that compound as the app grows:
//
//   · The Actions column widened with whatever the busiest row needed, and a
//     conditional button (a student on a temp password gets an extra one) made
//     the column jitter between rows.
//   · Icon-only controls are a guess unless you hover for the tooltip. In a
//     menu the same actions carry their labels.
//   · Destructive actions sat one careless click from Edit, at icon size.
//     Here `destructive` is visually separated and last.
//
// What it deliberately does NOT change: each item still calls exactly the
// handler its button called, and destructive items still open their existing
// confirm dialog rather than acting immediately. This is a change of affordance,
// not of behaviour.
"use client";

import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowAction = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  /** Renders in the destructive group at the bottom, after a separator. */
  destructive?: boolean;
  disabled?: boolean;
};

export function RowActions({
  actions,
  label = "Row actions",
}: {
  /** Falsy entries are dropped, so callers can inline `cond && {...}`. */
  actions: Array<RowAction | false | null | undefined>;
  label?: string;
}) {
  const items = actions.filter((a): a is RowAction => Boolean(a));
  if (items.length === 0) return null;

  const normal = items.filter((a) => !a.destructive);
  const destructive = items.filter((a) => a.destructive);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            // The trigger is the only always-present control, so the column
            // width is now constant regardless of how many actions a row has.
            className="data-[popup-open]:bg-muted"
          >
            <MoreHorizontal />
          </Button>
        }
      />
      {/* DropdownMenuContent defaults to `w-(--anchor-width)`, which sizes the
          popup to its trigger. That suits a select, whose trigger is as wide as
          the field, but here the anchor is a 28px icon button — so a label like
          "Reissue temp password" wrapped onto two lines. `w-auto` lets the menu
          size to its content instead; the items stay on one line. */}
      <DropdownMenuContent align="end" className="w-auto min-w-40 whitespace-nowrap">
        {normal.map((a) => (
          <DropdownMenuItem key={a.label} onClick={a.onSelect} disabled={a.disabled}>
            {a.icon ? <a.icon /> : null}
            {a.label}
          </DropdownMenuItem>
        ))}
        {normal.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
        {destructive.map((a) => (
          <DropdownMenuItem
            key={a.label}
            variant="destructive"
            onClick={a.onSelect}
            disabled={a.disabled}
          >
            {a.icon ? <a.icon /> : null}
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
