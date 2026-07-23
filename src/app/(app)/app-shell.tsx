// The authenticated app shell: brand rail + a breadcrumb bar that reflects the
// current page (Group / Page), derived from the nav config so it's always
// accurate. Every authenticated page renders inside it. Nav is role-filtered to
// mirror the API's authorization, so the UI never offers a link that would 403.
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  CalendarCheck2,
  ClipboardList,
  Users,
  GraduationCap,
  BookOpen,
  CalendarClock,
  UsersRound,
  ShieldCheck,
  ChevronsUp,
  ChevronRight,
  LogOut,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useFirebaseUser, useMe, useSignOut } from "@/features/auth/hooks/use-auth";
import type { AuthUser } from "@/features/auth/types";

type NavChild = { title: string; href: string };

type NavFlags = { roles: string[]; advisesClass: boolean };

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  // Roles allowed to see this item; undefined = everyone signed in.
  roles?: string[];
  // Finer visibility beyond role names, evaluated with live profile flags. When
  // present it REPLACES the role check for this item (e.g. "Day attendance" needs
  // a manage role OR advising a class).
  gate?: (flags: NavFlags) => boolean;
  // If present, the item is a collapsible parent revealing these sub-links.
  children?: NavChild[];
  // Match this path exactly (don't also light up on its sub-routes). Use when a
  // sibling owns a sub-route, e.g. /attendance vs /attendance/report.
  exact?: boolean;
};

type NavGroup = { label: string; items: NavItem[] };

// Management nav is being rebuilt from the new schema (Program / Section /
// Semester / Attendance / Internal marks). Only the Overview remains for now;
// groups are re-added as each feature lands.
const NAV: NavGroup[] = [
  {
    label: "Today",
    items: [{ title: "Overview", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Attendance",
    items: [
      {
        title: "My timetable",
        href: "/attendance/timetable",
        icon: CalendarClock,
        // Program staff who actually teach — not the institution admin (Super
        // Admin never has a personal timetable).
        roles: ["HOD", "Faculty"],
      },
      {
        title: "Mark attendance",
        href: "/attendance",
        icon: CalendarCheck2,
        roles: ["Super Admin", "HOD", "Faculty"],
        exact: true, // /attendance/report and /attendance/timetable are siblings
      },
      {
        title: "Day attendance",
        href: "/attendance/day",
        icon: CalendarDays,
        // The class teacher's job: HOD/SA (manage), or a Faculty who advises a
        // class. A plain subject teacher who advises none doesn't see it.
        gate: ({ roles, advisesClass }) =>
          roles.includes("Super Admin") || roles.includes("HOD") || advisesClass,
      },
      {
        title: "Report",
        href: "/attendance/report",
        icon: ClipboardList,
        roles: ["Super Admin", "HOD", "Faculty"],
      },
    ],
  },
  {
    label: "Structure",
    items: [
      {
        title: "Structure setup",
        href: "/structure/degrees",
        icon: Building2,
        roles: ["Super Admin"],
        // The dependency chain: a Program pairs a Degree × Branch; a Class sits
        // within a Program.
        children: [
          { title: "Degrees", href: "/structure/degrees" },
          { title: "Branches", href: "/structure/branches" },
          { title: "Programs", href: "/structure/programs" },
          { title: "Classes", href: "/structure/classes" },
        ],
      },
    ],
  },
  {
    label: "Academic",
    items: [
      {
        title: "Years & semesters",
        href: "/academic",
        icon: CalendarDays,
        roles: ["Super Admin"],
      },
      {
        title: "Promotion",
        href: "/promotion",
        icon: ChevronsUp,
        roles: ["Super Admin"],
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        title: "My class",
        href: "/my-class",
        icon: UsersRound,
        // The class teacher's roster tool — surfaced only to a class advisor
        // (HOD/SA manage the full Students list instead).
        gate: ({ advisesClass }) => advisesClass,
      },
      {
        title: "Students",
        href: "/students",
        icon: Users,
        roles: ["Super Admin", "HOD"],
      },
      {
        title: "Faculty",
        href: "/faculty",
        icon: GraduationCap,
        roles: ["Super Admin", "HOD"],
      },
    ],
  },
  {
    label: "Curriculum",
    items: [
      {
        title: "Subjects",
        href: "/subjects",
        icon: BookOpen,
        roles: ["Super Admin", "HOD"],
      },
      {
        title: "Timetable",
        href: "/timetable",
        icon: CalendarClock,
        roles: ["Super Admin", "HOD"],
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "Access control",
        href: "/access",
        icon: ShieldCheck,
        roles: ["Super Admin"],
      },
    ],
  },
];

function visibleGroups(flags: NavFlags): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) =>
      i.gate ? i.gate(flags) : !i.roles || i.roles.some((r) => flags.roles.includes(r)),
    ),
  })).filter((g) => g.items.length > 0);
}

// Resolve the current path to a breadcrumb trail (Group / Page), derived from
// the nav config so it always matches the real navigation. Falls back to the
// last path segment for pages not in the nav (e.g. a future detail route).
function useBreadcrumbs(pathname: string): Array<{ label: string; href?: string }> {
  // Pick the most specific match (longest href), so /attendance/report resolves
  // to "Report", not its parent "Mark attendance".
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of NAV) {
    for (const item of group.items) {
      const isMatch = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (isMatch && (!best || item.href.length > best.item.href.length)) {
        best = { group, item };
      }
    }
  }
  if (best) {
    // The "Today" group is a single overview; don't prefix it with its label.
    return best.group.label === "Today"
      ? [{ label: best.item.title }]
      : [{ label: best.group.label }, { label: best.item.title, href: best.item.href }];
  }
  const last = pathname.split("/").filter(Boolean).at(-1) ?? "";
  return [{ label: last.charAt(0).toUpperCase() + last.slice(1) }];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { firebaseUser } = useFirebaseUser();
  const me = useMe(!!firebaseUser);
  const profile = me.data;
  const navFlags: NavFlags = {
    roles: profile?.roles ?? [],
    advisesClass: profile?.advisesClass ?? false,
  };
  const pathname = usePathname();
  const crumbs = useBreadcrumbs(pathname);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary font-heading text-xs font-semibold text-primary-foreground">
              JE
            </span>
            <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
              <span className="font-heading text-sm font-semibold text-sidebar-foreground">
                JEC ERP
              </span>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                System of record
              </span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {visibleGroups(navFlags).map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="font-mono text-[0.65rem] uppercase tracking-[0.18em]">
                {group.label}
              </SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => {
                  // Exact items (Overview, or a parent with a sibling sub-route)
                  // match only themselves; others also light up on sub-routes.
                  const active =
                    item.exact || item.href === "/dashboard"
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;

                  // Collapsible parent (e.g. Students → List / Add).
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

        <SidebarFooter>
          <UserMenu profile={profile} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        {/* Breadcrumb bar — reflects the current page (Group / Page), derived
            from the nav so it's always accurate. Matches the shadcn reference. */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((crumb, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <span key={`${crumb.label}-${i}`} className="contents">
                    <BreadcrumbItem>
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
        </header>

        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// A collapsible nav parent (e.g. Students → List / Add / Import). Controlled so
// Base UI doesn't warn about a changing default-open: it's open whenever one of
// its routes is active OR the user has expanded it, and collapses when the user
// closes it (unless a route keeps it active). (An uncontrolled
// `defaultOpen={active}` warns because `active` flips false→true after the first
// render, once the route resolves.)
function CollapsibleNavItem({
  item,
  active,
  pathname,
}: {
  item: NavItem;
  active: boolean;
  pathname: string;
}) {
  // Track only the user's manual intent; the open state is derived from it +
  // whether a route is active — no setState-in-effect needed.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? active;

  const Icon = item.icon;
  return (
    <Collapsible open={open} onOpenChange={setUserOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton isActive={active} tooltip={item.title}>
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

function UserMenu({ profile }: { profile: AuthUser | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const signOut = useSignOut();
  const initials = (profile?.displayName ?? "· ·")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const signOutNow = () =>
    signOut.mutate(undefined, { onSuccess: () => router.replace("/login") });

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex items-center gap-1">
          {/* The user chip opens the profile page. Sign-out is the icon button
              beside it (and, on the profile page, in the shell as well). */}
          <SidebarMenuButton
            size="lg"
            isActive={pathname === "/profile"}
            tooltip="Your profile"
            className="flex-1 gap-2.5"
            render={<Link href="/profile" />}
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
          </SidebarMenuButton>

          {/* Direct sign-out beside the user chip. Hidden when the rail collapses
              to icons — expand the rail (or use the profile page) to sign out. */}
          <button
            type="button"
            onClick={signOutNow}
            disabled={signOut.isPending}
            aria-label="Sign out"
            title="Sign out"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-50 group-data-[collapsible=icon]:hidden"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
