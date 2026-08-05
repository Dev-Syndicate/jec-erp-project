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
  };
  const pathname = usePathname();

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar flags={navFlags} profile={profile} pathname={pathname} />

        <SidebarInset className="min-w-0">
          <AppHeader pathname={pathname} />
          <div className="flex flex-1 flex-col">{children}</div>
        </SidebarInset>

        <CommandPalette flags={navFlags} />
      </SidebarProvider>
    </TooltipProvider>
  );
}
