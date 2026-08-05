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
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur-sm sm:px-4">
      <SidebarTrigger className="-ml-1" />

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
