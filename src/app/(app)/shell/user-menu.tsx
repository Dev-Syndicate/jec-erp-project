// The signed-in user's chip at the foot of the rail, opening an account menu.
//
// Was a chip + adjacent sign-out button. The chip is now the trigger for a
// DropdownMenu: it holds the identity header (name + email, the "which account
// am I in" answer that a rail showing only a role couldn't give), the profile
// link, and sign-out — with room for the account actions that land later.
//
// TWO THINGS THIS HAS TO KEEP DOING, both previously fixed here:
//   1. Sign-out survives collapsing the rail. It used to be hidden at
//      `collapsible=icon`, which removed the only way out of the shell. Inside
//      the menu it is reachable in both states, because the trigger is the
//      avatar and the avatar never hides.
//   2. The menu opens to the SIDE. A footer sits at the bottom of the viewport,
//      so a menu below it would be clipped; `side="right"` with align="end"
//      puts it alongside the rail the way the sidebar's own tooltips go.
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
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

  const initials = initialsOf(profile?.displayName);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                // Reads as current while you're on the page the menu links to.
                isActive={pathname === "/profile"}
                // No `tooltip` prop on purpose: it makes SidebarMenuButton wrap
                // itself in a TooltipTrigger, which would put two triggers on one
                // element and leave a tooltip hanging over the open menu. The
                // menu's own header names the account, so nothing is lost.
                className="gap-2.5 data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-sidebar-accent font-mono text-[0.65rem] font-semibold text-sidebar-accent-foreground">
              {initials}
            </span>
            <span className="flex flex-1 flex-col overflow-hidden text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium text-sidebar-foreground">
                {profile?.displayName ?? "…"}
              </span>
              <span className="truncate font-mono text-[0.65rem] text-muted-foreground">
                {profile?.roles[0] ?? "No role"}
              </span>
            </span>
            <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="right"
            align="end"
            sideOffset={8}
            // The trigger is full-rail width, and w-(--anchor-width) would make
            // the menu match it — too narrow for an email once the rail is
            // collapsed to an icon. Fixed width instead.
            className="w-60"
          >
            {/* Identity header: name over email. The email is what disambiguates
                a shared machine, and it appears nowhere else in the shell. */}
            <div className="flex items-center gap-2.5 px-1.5 py-1.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted font-mono text-[0.65rem] font-semibold">
                {initials}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-medium">
                  {profile?.displayName ?? "…"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {profile?.email ?? ""}
                </span>
              </span>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem className="px-1.5 py-1.5" render={<Link href="/profile" />}>
              <UserRound />
              Your profile
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              variant="destructive"
              className="px-1.5 py-1.5"
              onClick={signOutNow}
              disabled={signOut.isPending}
            >
              <LogOut />
              {signOut.isPending ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
