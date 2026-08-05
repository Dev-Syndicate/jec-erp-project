// ⌘K / Ctrl-K quick navigation.
//
// It lists EXACTLY what the sidebar lists, because it calls the same
// `visibleGroups(flags)` — the permission predicate is never re-implemented
// here. If the palette and the rail could disagree, one of them would be
// offering a link that 403s, which is the single promise the nav exists to
// keep. Sub-links (Structure setup → Degrees, …) are flattened in, since they
// are real destinations and inherit their parent's visibility.
//
// No API calls and no server search: there is no search endpoint in this app,
// and inventing a client-side one over the currently-loaded page would be a
// search that silently misses most records. This navigates modules only, which
// is a promise it can actually keep.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { visibleGroups, type NavFlags } from "@/app/(app)/shell/nav-config";

type Entry = {
  group: string;
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Lowercased "group title href", matched as one string. */
  haystack: string;
};

function entriesFor(flags: NavFlags): Entry[] {
  return visibleGroups(flags).flatMap((group) =>
    group.items.flatMap((item) => {
      const rows: Entry[] = [
        {
          group: group.label,
          title: item.title,
          href: item.href,
          icon: item.icon,
          haystack: `${group.label} ${item.title} ${item.href}`.toLowerCase(),
        },
      ];
      for (const child of item.children ?? []) {
        rows.push({
          group: item.title,
          title: child.title,
          href: child.href,
          icon: item.icon,
          haystack: `${item.title} ${child.title} ${child.href}`.toLowerCase(),
        });
      }
      return rows;
    }),
  );
}

export function CommandPalette({ flags }: { flags: NavFlags }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // The highlighted row, stored WITH the query it was chosen under. Typing
  // changes the result list, so a raw index would point at whatever now happens
  // to sit in that slot — or past the end of a shorter list.
  //
  // Reading it back as "0 unless the query still matches" derives the reset
  // instead of performing it: an effect watching `query` would land a render
  // late, flashing the stale highlight, and is the setState-in-effect the lint
  // rule (rightly) rejects.
  const [mark, setMark] = useState({ query: "", index: 0 });
  const cursor = mark.query === query ? mark.index : 0;
  const setCursor = (next: number) => setMark({ query, index: next });

  const all = useMemo(() => entriesFor(flags), [flags]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    // Every whitespace-separated term must appear, so "att rep" finds
    // "Attendance · Report" without needing the words adjacent.
    const terms = q.split(/\s+/);
    return all.filter((e) => terms.every((t) => e.haystack.includes(t)));
  }, [all, query]);

  // Open on ⌘K / Ctrl-K from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(results.length ? (cursor + 1) % results.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(results.length ? (cursor - 1 + results.length) % results.length : 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[cursor];
      if (hit) go(hit.href);
    }
  }

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[15%] max-w-lg translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Go to</DialogTitle>
        <DialogDescription className="sr-only">
          Search the sections you have access to and jump to one.
        </DialogDescription>

        <div className="flex items-center gap-2.5 border-b border-border px-3.5">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Go to…"
            aria-label="Go to"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Kbd className="shrink-0">Esc</Kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((entry, i) => {
              const Icon = entry.icon;
              return (
                <button
                  key={`${entry.group}-${entry.href}`}
                  type="button"
                  data-index={i}
                  onClick={() => go(entry.href)}
                  onMouseMove={() => setCursor(i)}
                  aria-current={i === cursor}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{entry.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{entry.group}</span>
                  {i === cursor ? (
                    <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
