// The navigation rail: brand lockup, role-filtered grouped nav, user chip.
//
// Everything about WHICH items appear lives in nav-config.ts and is pinned by
// test/app/nav-config.test.ts. This file is presentation: it decides how a group
// heading reads and what "current" looks like, never who may see what.
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AuthUser } from "@/features/auth/types";
import { UserMenu } from "@/app/(app)/shell/user-menu";
import {
  isNavItemActive,
  visibleGroups,
  type NavFlags,
  type NavItem,
} from "@/app/(app)/shell/nav-config";

export function AppSidebar({
  flags,
  profile,
  pathname,
}: {
  flags: NavFlags;
  profile: AuthUser | undefined;
  pathname: string;
}) {
  return (
    // `variant="inset"` is what makes the rail the OUTER frame and floats the
    // page in a rounded panel beside it. It is a structural switch on the
    // primitive, not a restyle: it moves three classes that already exist in
    // ui/sidebar.tsx — the wrapper takes bg-sidebar, the rail gains a 8px
    // gutter, and SidebarInset gains m-2/rounded-xl/shadow-sm. Nothing about
    // which items render, or their colours, changes.
    //
    // The three planes land in the right order for free, because the tokens were
    // already set up that way: frame = --sidebar (white), page = --background
    // (#fafafa), cards on the page = --card (white). The rail deliberately
    // blends into the frame — the rounded panel, not a border, is what separates
    // navigation from content.
    // The rail starts BELOW the full-width header rather than at the top of the
    // viewport, which is what lets the header read as one continuous band.
    //
    // The offset has to be written here because the primitive hard-codes
    // `fixed inset-y-0 … h-svh` on its container. `h-[calc(…)]` beats `h-svh`
    // through twMerge on its own (same group, last wins), but `top-14` and
    // `inset-y-0` are DIFFERENT groups, so twMerge keeps both and the winner
    // would come down to stylesheet order — hence the explicit `!`. This is the
    // rare case the bang is actually for; see the note in ui/input.tsx about the
    // ~60 places it was cargo-culted.
    //
    // Desktop only, by construction: Sidebar returns the mobile Sheet before it
    // ever reads `className`, so the drawer keeps its own full-height geometry.
    <Sidebar
      collapsible="icon"
      variant="inset"
      className="top-14! h-[calc(100svh-3.5rem)]"
    >
      {/* No SidebarHeader: the brand lockup moved into AppHeader so the top band
          is unbroken. The rail now opens straight into its first group. */}
      {/* The primitive ships `group-data-[collapsible=icon]:overflow-hidden`,
          which silently disables scrolling in the collapsed rail — with 13 items
          plus a footer the last icon was simply unreachable on a short viewport.
          That default exists to stop the hover tooltips being clipped by the
          scroll container, and it does not apply here: ui/tooltip.tsx renders
          through a Portal, so the tooltip is not a descendant of this element.

          `overflow-x-hidden` is kept deliberately. The labels are still in the
          DOM when collapsed (they carry the buttons' accessible names), so an
          `auto` x-axis in a 52px rail would offer a horizontal scrollbar over
          text nobody can read. Only the y-axis should move. */}
      <SidebarContent className="gap-1 py-2 group-data-[collapsible=icon]:overflow-x-hidden group-data-[collapsible=icon]:overflow-y-auto">
        {visibleGroups(flags).map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            {/* Hidden when collapsed: a wide-tracked label in a 3.5rem rail is
                unreadable, and the group separation still reads from spacing. */}
            <SidebarGroupLabel className="eyebrow text-[0.65rem] text-muted-foreground/80 group-data-[collapsible=icon]:hidden">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = isNavItemActive(item, pathname);
                const Icon = item.icon;

                if (item.children?.length) {
                  return (
                    <CollapsibleNavItem
                      key={item.title}
                      item={item}
                      active={active}
                      pathname={pathname}
                    />
                  );
                }

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.title}
                      // The active treatment: a brand-tinted surface plus a left
                      // rule. The rule is what makes the current item findable
                      // at a glance down a rail of 13 entries — the tint alone
                      // is too quiet against a white sidebar.
                      className="relative data-[active=true]:before:absolute data-[active=true]:before:left-0 data-[active=true]:before:top-1/2 data-[active=true]:before:h-4.5 data-[active=true]:before:w-0.5 data-[active=true]:before:-translate-y-1/2 data-[active=true]:before:rounded-r-full data-[active=true]:before:bg-primary data-[active=true]:font-medium"
                      render={<Link href={item.href} />}
                    >
                      <Icon className="size-4" />
                      <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu profile={profile} />
      </SidebarFooter>
      {/* No <SidebarRail />. It is shadcn's 4px strip along the rail's outer
          edge that toggles the sidebar, and its ::after paints a 2px
          sidebar-border line on hover — the stray divider that appeared between
          the rail and the page panel, with a native "Toggle Sidebar" tooltip
          attached. Nothing is lost by dropping it: it carries tabIndex={-1} so
          it was never keyboard-reachable, and the header's SidebarTrigger is the
          real, labelled control for the same action. */}
    </Sidebar>
  );
}

// A collapsible nav parent (e.g. Structure setup → Degrees / Branches / …).
//
// ⚠️ DO NOT SIMPLIFY TO `defaultOpen={active}`. The open state is CONTROLLED and
// derived from the user's manual intent plus route activity. Uncontrolled,
// Base UI warns: `active` flips false→true after the first render once the route
// resolves, which reads to it as a changing default. Keeping `userOpen` as the
// only state means no setState-in-effect and no warning.
function CollapsibleNavItem({
  item,
  active,
  pathname,
}: {
  item: NavItem;
  active: boolean;
  pathname: string;
}) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? active;

  const Icon = item.icon;
  return (
    <Collapsible open={open} onOpenChange={setUserOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton
              isActive={active}
              tooltip={item.title}
              className="relative data-[active=true]:before:absolute data-[active=true]:before:left-0 data-[active=true]:before:top-1/2 data-[active=true]:before:h-4.5 data-[active=true]:before:w-0.5 data-[active=true]:before:-translate-y-1/2 data-[active=true]:before:rounded-r-full data-[active=true]:before:bg-primary data-[active=true]:font-medium"
            >
              <Icon className="size-4" />
              <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
              <ChevronRight className="ml-auto size-4 transition-transform group-data-open/collapsible:rotate-90 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          }
        />
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children!.map((child) => (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton
                  isActive={pathname === child.href}
                  render={<Link href={child.href} />}
                >
                  <span>{child.title}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
