// The search box with the magnifier inside it. Five screens hand-composed this
// same `relative` wrapper + absolutely-positioned icon + `pl-9` input.
//
// The icon is `pointer-events-none` so a click on it lands on the field behind
// rather than doing nothing — the failure is silent and it is the reason this
// pattern is worth centralising rather than re-typing.
//
// Note what this does NOT do: no internal state, no debounce, no query
// ownership. Search means different things per screen — students search the
// server (debounced, resets to page 1), faculty filters an already-loaded list
// — and burying either policy here would make the component lie about one of
// them. It is a styled input; the caller keeps the behaviour.
"use client";

import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  label,
  className,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Accessible name. Required — the magnifier is decorative. */
  label: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={id}
        size="lg"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="pr-9 pl-9"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
