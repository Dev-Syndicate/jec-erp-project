// The top bar: rail toggle, breadcrumbs, and the ⌘K search affordance.
//
// It stays compact and does NOT carry the page title. Each page renders its own
// <PageHeader> (eyebrow + title + description) — 22 of them do — and duplicating
// the title here would either mean 22 files change to remove theirs, or the same
// words appearing twice, 40px apart. The breadcrumb already answers "where am
// I"; the page header answers "what is this".
//
// Sticky, so the trail and the search stay reachable down a 500-row roster.
"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { buildBreadcrumbs } from "@/app/(app)/shell/nav-config";

export function AppHeader({ pathname }: { pathname: string }) {
  const crumbs = buildBreadcrumbs(pathname);

  return (
    // A full-width band across the top of the shell: brand on the left, over the
    // rail's column, then the trail and search continuing across the page panel.
    // z-30 puts it above the rail's fixed container (z-10), which now starts
    // below this bar.
    // No bottom border: the band and the rail beneath it are the same plane, so a
    // rule across the full width just cut the frame in half. Separation comes
    // from the page panel's own ring, which is the only edge that means anything
    // here. `bg-card/95 backdrop-blur-sm` stays — it is what keeps the bar
    // legible once rows scroll underneath it.
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-card/95 px-3 backdrop-blur-sm sm:px-4">
      {/* The lockup lives here rather than in the rail so the bar reads as one
          continuous strip. `/dashboard` is the one route with no role gate at
          all, so this is safe for every signed-in user.
          Width-matched to the rail on md+ so the divider under it lines up with
          the rail's edge; on a phone it collapses to just the mark. */}
      <Link
        href="/dashboard"
        className="-mx-1 flex shrink-0 items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring md:w-[calc(var(--sidebar-width)-1.25rem)]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary font-heading text-xs font-semibold text-primary-foreground">
          JE
        </span>
        <span className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span className="font-heading text-sm font-semibold text-sidebar-foreground">
            JEC ERP
          </span>
          {/* `eyebrow` sets 0.18em tracking, which pushes this 28-character name
              past the rail-matched width and clips it to "…ENGINEERING COL…".
              Tightened just enough to fit; `truncate` stays as the safety net for
              a narrower rail. */}
          <span className="eyebrow truncate text-[0.6rem] tracking-[0.08em] text-muted-foreground">
            Jeppiaar Engineering College
          </span>
        </span>
      </Link>

      <SidebarTrigger />

      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={`${crumb.label}-${i}`} className="contents">
                <BreadcrumbItem>
                  {/* Both crumbs render as plain text today: the group crumb
                      never carries an href (see buildBreadcrumbs — it is derived
                      from the UNFILTERED nav, so a link could 403), and the page
                      crumb is the current page. The link branch stays for a
                      future trail that is genuinely three deep. */}
                  {last || !crumb.href ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!last && <BreadcrumbSeparator />}
              </span>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Opens the palette by dispatching the same shortcut it listens for, so
          there is one code path for the keyboard and the click. */}
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }),
          )
        }
        className="flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Go to…</span>
        <Kbd className="hidden bg-transparent sm:inline-flex">⌘K</Kbd>
      </button>
    </header>
  );
}
