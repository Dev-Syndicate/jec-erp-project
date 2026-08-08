// The authenticated app shell: navigation rail + header bar. Every authenticated
// page renders inside it.
//
// This file used to be 550 lines holding the nav model, the sidebar, the header,
// the breadcrumb logic and the user menu together. It is now the composition
// root; the parts live in ./shell/:
//
//   nav-config.ts     — WHAT exists and WHO may see it (pure, unit-tested)
//   app-sidebar.tsx   — the rail
//   app-header.tsx    — the top bar
//   user-menu.tsx     — the footer chip + sign-out
//   command-palette.tsx — ⌘K, reading the same visibleGroups() as the rail
//
// The split matters most for nav-config: it is the security-adjacent part, and
// as a pure module with no client APIs it can be exercised by the unit suite
// (test/app/nav-config.test.ts) in a way it never could while embedded here.
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useFirebaseUser, useMe } from "@/features/auth/hooks/use-auth";
import { AppHeader } from "@/app/(app)/shell/app-header";
import { AppSidebar } from "@/app/(app)/shell/app-sidebar";
import { CommandPalette } from "@/app/(app)/shell/command-palette";
import type { NavFlags } from "@/app/(app)/shell/nav-config";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { firebaseUser } = useFirebaseUser();
  const me = useMe(!!firebaseUser);
  const profile = me.data;
  // Both default to the empty/false case while `me` is in flight, so the nav
  // filters down to the ungated items rather than flashing entries the user may
  // not be allowed to see.
  const navFlags: NavFlags = {
    roles: profile?.roles ?? [],
    advisesClass: profile?.advisesClass ?? false,
    teaches: profile?.teaches ?? false,
  };
  const pathname = usePathname();

  // The page panel scrolls itself rather than the window (see the layout note
  // below), and this element lives in the LAYOUT — so it survives navigation and
  // keeps its scrollTop. Next's own scroll restoration only ever resets the
  // window, so without this you land halfway down Faculty after scrolling
  // Students. Restores the behaviour the window scroller gave for free.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <TooltipProvider>
      {/* `flex-col` turns the provider's own wrapper into a column so the header
          can be a full-width band ABOVE the rail + panel row, rather than a strip
          that starts where the rail ends. That is the one structural change here;
          the row below it is the same two children in the same order. */}
      {/* On md+ the shell is a FIXED-HEIGHT frame and the page panel scrolls its
          own content. That is what keeps the panel's rounded top edge on screen
          while you scroll — with the window as the scroller the whole panel slid
          up and the corners disappeared under the header.
          `min-h-0` on the row is the load-bearing bit: without it the flex child
          sizes to its content and the inner overflow never engages.
          Below md the panel is full-bleed with no corners to preserve, so the
          native window scroll is left alone — an inner scroller there would pin
          the mobile browser's URL bar open for no benefit. */}
      {/* Narrower than the 16rem the shadcn primitive ships with. The widest
          label in the rail is "Years & semesters", which ends ~175px in, so the
          default left ~80px of dead space against the right edge on every page.
          14.5rem keeps a comfortable margin — including for "Structure setup",
          the longest label that also carries a right-aligned chevron.
          Set here rather than by editing SIDEBAR_WIDTH in components/ui/sidebar.tsx:
          that file is shadcn-generated and a future `shadcn add sidebar` would
          overwrite it. SidebarProvider spreads an incoming `style` AFTER its own
          defaults, so this is the supported override, and it keeps the app's
          choice visible in the app's own file. --sidebar-width is a variable the
          rail, the inset and the header lockup all read, so they stay in step. */}
      {/* --sidebar-width-icon is narrowed from the primitive's 3.5rem for the
          same reason, and it is measured rather than taste. Collapsed, the icon
          button is 36px and sits inside 8px of group padding plus 8px of rail
          padding, so the rail only needs 36 + 16 + 16 = 68px of content. At
          3.5rem the reserved column came to 72px, leaving 4px of slack that
          showed up entirely on the RIGHT — the icons read as pushed toward the
          rail's left edge. 3.25rem makes the two gutters equal at 16px. */}
      <SidebarProvider
        style={
          {
            "--sidebar-width": "14.5rem",
            "--sidebar-width-icon": "3.25rem",
          } as React.CSSProperties
        }
        className="flex-col md:h-svh md:overflow-hidden"
      >
        <AppHeader pathname={pathname} />

        <div className="flex w-full flex-1 md:min-h-0">
          <AppSidebar flags={navFlags} profile={profile} pathname={pathname} />

          {/* The ring is the house convention for defining a surface (see the
              elevation note in globals.css) and it is what gives the panel's
              rounded edge a crisp line — the frame is white and the panel is
              #fafafa, so the built-in shadow alone barely registers between them.
              Scoped to `md` because below that the panel is full-bleed with no
              rounding, where a ring would just draw a stray line down the screen
              edge. */}
          {/* `mt-1!` tightens the gap under the header from 8px to 2px. The bang
              is required, not decorative: the primitive sets the panel's inset
              with the `m-2` SHORTHAND, and a longhand `mt-1` in a different
              variant stack does not reliably out-order it — measured, it lost and
              the margin stayed 8px. */}
          {/* `overflow-hidden` here is what actually clips the scrolling content
              to the rounded corners. It was off-limits before only because the
              header used to live INSIDE this panel and `overflow` would have
              broken its `sticky`; the header is now a sibling above, so the
              objection is gone. */}
          {/* The collapsed `ml-2` is cancelled, not overridden with `!`: repeating
              the primitive's exact variant stack lets twMerge recognise it as the
              same utility and drop the earlier class. That 8px was the larger
              half of the right-gutter asymmetry — expanded, the panel sits flush
              against the rail's column with no extra margin, and there is no
              reason for collapsing to introduce one. */}
          <SidebarInset className="min-w-0 md:mt-1! md:overflow-hidden md:ring-1 md:ring-foreground/10 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0">
            <div ref={scroller} className="flex flex-1 flex-col md:min-h-0 md:overflow-y-auto">
              {children}
            </div>
          </SidebarInset>
        </div>

        <CommandPalette flags={navFlags} />
      </SidebarProvider>
    </TooltipProvider>
  );
}
