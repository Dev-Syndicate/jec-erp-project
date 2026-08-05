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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
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
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        {/* The lockup navigates home. `/dashboard` is the one route with no
            role gate at all, so this is safe for every signed-in user. */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:px-0"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary font-heading text-xs font-semibold text-primary-foreground">
            JE
          </span>
          <span className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-heading text-sm font-semibold text-sidebar-foreground">
              JEC ERP
            </span>
            <span className="eyebrow text-[0.6rem] text-muted-foreground">
              Jeppiaar Engineering College
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-1 py-2">
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
      <SidebarRail />
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
