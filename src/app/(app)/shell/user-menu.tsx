// The signed-in user's chip at the foot of the rail, plus sign-out.
//
// Kept as a chip + adjacent button rather than promoted to a DropdownMenu: both
// actions here are one click today, and a menu would make each of them two to
// buy a tidier footprint. The menu is the right shape once there are four or
// five account actions; with two it is just friction.
//
// FIXED HERE: sign-out used to be `group-data-[collapsible=icon]:hidden`, so
// collapsing the rail removed the only way to sign out of the shell. It now
// swaps to an icon-only button that stays reachable in both states — the rail
// collapses to save room, not to withdraw functionality.
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSignOut } from "@/features/auth/hooks/use-auth";
import type { AuthUser } from "@/features/auth/types";

/** First letters of up to two words — "Catherine Kim" → "CK". */
function initialsOf(displayName: string | undefined): string {
  return (displayName ?? "· ·")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu({ profile }: { profile: AuthUser | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const signOut = useSignOut();

  // The redirect is part of signing out, not a nicety: without it the user sits
  // on an authed page until AuthGate notices and bounces them, which looks fine
  // on a fast connection and looks broken on a slow one.
  const signOutNow = () =>
    signOut.mutate(undefined, { onSuccess: () => router.replace("/login") });

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
          <SidebarMenuButton
            size="lg"
            isActive={pathname === "/profile"}
            tooltip="Your profile"
            className="flex-1 gap-2.5"
            render={<Link href="/profile" />}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-sidebar-accent font-mono text-[0.65rem] font-semibold text-sidebar-accent-foreground">
              {initialsOf(profile?.displayName)}
            </span>
            <span className="flex flex-1 flex-col overflow-hidden text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium text-sidebar-foreground">
                {profile?.displayName ?? "…"}
              </span>
              <span className="truncate font-mono text-[0.65rem] text-muted-foreground">
                {profile?.roles[0] ?? "No role"}
              </span>
            </span>
          </SidebarMenuButton>

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={signOutNow}
                  disabled={signOut.isPending}
                  aria-label="Sign out"
                  className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:opacity-50"
                />
              }
            >
              <LogOut className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
