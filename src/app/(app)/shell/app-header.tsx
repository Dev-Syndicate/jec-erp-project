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

import Image from "next/image";
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
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { buildBreadcrumbs } from "@/app/(app)/shell/nav-config";
import { cn } from "@/lib/utils";

export function AppHeader({ pathname }: { pathname: string }) {
  const crumbs = buildBreadcrumbs(pathname);
  // Drives the brand slot's width so the trail lines up with the page panel's
  // text in BOTH rail states — see the slot's comment below.
  const { state } = useSidebar();

  return (
    // A full-width band across the top of the shell: brand on the left, over the
    // rail's column, then the trail and search continuing across the page panel.
    // z-30 puts it above the rail's fixed container (z-10), which now starts
    // below this bar.
    // No bottom border: the band and the rail beneath it are the same plane, so a
    // rule across the full width just cut the frame in half. Separation comes
    // from the page panel's own ring, which is the only edge that means anything
    // here.
    //
    // `bg-sidebar/95`, not `bg-card` — the bar IS the frame's top edge, so it has
    // to wear the frame's colour or the tint stops halfway up the screen. The 95%
    // + blur stays: without a border it is the only thing keeping the bar legible
    // once rows scroll underneath it.
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-sidebar/95 px-3 backdrop-blur-sm sm:px-4">
      {/* The brand slot. Its only job is to be exactly as wide as the page panel's
          left edge, so the breadcrumb after it starts in the same column as the
          page's own title rather than floating in from the left.

          The arithmetic, at sm+ where the header pads by 1rem and its gap is
          0.5rem: trail x = 1rem + SLOT + 0.5rem, and the page text sits at
          panelEdge + 1.5rem (PageShell's `sm:p-6`). Since 1rem + 0.5rem = 1.5rem,
          the two agree exactly when SLOT == panelEdge.

          panelEdge is not one number, because the rail is `collapsible="icon"`
          and `variant="inset"`:
            expanded  — the rail's gap element is --sidebar-width, inset ml-0
                        → --sidebar-width
            collapsed — gap is --sidebar-width-icon + spacing(4) (0.5rem+0.5rem of
                        the inset variant's own padding), plus the inset's ml-2
                        → --sidebar-width-icon + 1.5rem
          Hence the state switch. A single fixed width would sit ~150px off the
          moment anyone collapses the rail.

          md: only — below that the rail is an off-canvas sheet, there is no panel
          edge to meet, and the slot collapses back to its content width.
          The transition matches the rail's own (200ms linear) so the trail travels
          with the panel edge instead of snapping ahead of it. */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 md:transition-[width] md:duration-200 md:ease-linear",
          state === "collapsed"
            ? "md:w-[calc(var(--sidebar-width-icon)+1.5rem)]"
            : "md:w-(--sidebar-width)",
        )}
      >
        {/* The lockup lives here rather than in the rail so the bar reads as one
            continuous strip. `/dashboard` is the one route with no role gate at
            all, so this is safe for every signed-in user. */}
        <Link
          href="/dashboard"
          className="-mx-1 flex shrink-0 items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {/* Decorative (alt=""): the wordmark beside it already names this link, so
              a described image would make a screen reader announce it twice. The
              crest is 949x908 — object-contain keeps the ring circular in a square
              box rather than letting the 4% overhang squash it. */}
          <Image
            src="/home_logo.png"
            alt=""
            width={949}
            height={908}
            priority
            className="size-8 shrink-0 object-contain"
          />
          {/* Always sr-only, never `hidden`: the wordmark is this link's
              accessible name, so removing it from the tree would leave the link
              nameless. These classes only decide whether it is PAINTED.

              Painted from sm up — EXCEPT when the rail is collapsed. The slot
              then narrows to the icon rail's width (~80px) while the crest plus
              this wordmark need ~127px, and the Link is shrink-0, so it spilled
              out of the slot and printed on top of the breadcrumb. Falling back
              to the mark alone mirrors what the rail itself does when collapsed:
              icons, no labels. */}
          <span
            className={cn(
              "font-heading text-lg font-semibold tracking-tight text-sidebar-foreground",
              state === "collapsed" ? "sr-only" : "sr-only sm:not-sr-only",
            )}
          >
            JEC ERP
          </span>
        </Link>

        <SidebarTrigger />
      </div>

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
