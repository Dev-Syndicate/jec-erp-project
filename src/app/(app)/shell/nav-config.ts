// The navigation model: what exists, who may see it, and which entry a URL
// belongs to. Extracted verbatim from app-shell.tsx so it can be unit-tested —
// this is the one part of the shell that is SECURITY-ADJACENT.
//
// Nav visibility mirrors the API's authorization so the UI never offers a link
// that would 403. It is NOT itself a security boundary — every route
// re-authorizes server-side — but a mistake here shows people doors they cannot
// open, or hides doors they need. A stray character in a `roles` array or a
// `gate` silently changes what a whole role sees, and nothing would fail loudly.
// Hence test/app/nav-config.test.ts, which pins the visible set per persona.
//
// ⚠️ NOT a client module on purpose (no "use client"). It is imported by the
// sidebar, the header's breadcrumbs and the command palette; keeping it free of
// client-only APIs means it stays importable from a test and from a server
// component alike.
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  CalendarCheck2,
  ClipboardList,
  ClipboardPen,
  CalendarOff,
  Users,
  GraduationCap,
  ArrowLeftRight,
  BookOpen,
  CalendarClock,
  UsersRound,
  UserRoundCheck,
  ShieldCheck,
  ChevronsUp,
} from "lucide-react";

export type NavChild = { title: string; href: string };

export type NavFlags = { roles: string[]; advisesClass: boolean };

export type NavItem = {
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

export type NavGroup = { label: string; items: NavItem[] };

/**
 * The group whose single item is the dashboard. Breadcrumbs special-case it by
 * name, so it is a constant rather than a literal in two places.
 */
export const OVERVIEW_GROUP = "Today";

export const NAV: NavGroup[] = [
  {
    label: OVERVIEW_GROUP,
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
        // Teaching work, not institution admin — Super Admin has no timetable to
        // mark against. They keep the permission (the API still authorizes
        // `manage all`, so a stuck record can be fixed); the nav just stops
        // offering it.
        roles: ["HOD", "Faculty"],
        exact: true, // /attendance/report and /attendance/timetable are siblings
      },
      {
        title: "Day attendance",
        href: "/attendance/day",
        icon: CalendarDays,
        // The class teacher's job: a HOD, or a Faculty who advises a class. A
        // plain subject teacher who advises none doesn't see it, and neither
        // does Super Admin (see "Mark attendance").
        gate: ({ roles, advisesClass }) => roles.includes("HOD") || advisesClass,
      },
      {
        title: "Arrange cover",
        href: "/attendance/cover",
        icon: UserRoundCheck,
        // Assigning a stand-in for an absent teacher's period. A supervised act
        // (it grants the right to sign another teacher's register), so a HOD's
        // job — never the teachers themselves.
        //
        // Super Admin keeps the permission but not the nav entry, exactly like
        // "Mark attendance": running a department's day-to-day cover isn't their
        // work. The API still accepts them, so a department with no HOD (or an
        // absent one) can still be unstuck by going to the page directly.
        roles: ["HOD"],
      },
      {
        title: "Report",
        href: "/attendance/report",
        icon: ClipboardList,
        // The one attendance view Super Admin keeps — reading across the
        // institution is their job; recording attendance isn't.
        roles: ["Super Admin", "HOD", "Faculty"],
      },
    ],
  },
  {
    label: "Assessment",
    items: [
      {
        title: "Internal marks",
        href: "/marks",
        icon: ClipboardPen,
        // Staff who enter marks: a HOD, or a Faculty assigned to a subject this
        // semester. The picker is empty for a faculty with no assignments, but
        // the nav still shows it (the API is the real gate). Entering marks is
        // teaching work, so Super Admin doesn't see it.
        roles: ["HOD", "Faculty"],
      },
      {
        title: "Leave & OD",
        href: "/leave",
        icon: CalendarOff,
        // A student applies + tracks; a class teacher / HOD approve. The page is
        // role-aware (the API reports isStudent / canApprove), so one nav entry
        // serves both. Students have no other nav items, so this is their first
        // staff-shell link. Approval is a class-teacher → HOD flow, so Super
        // Admin is not in the queue.
        roles: ["HOD", "Faculty", "Student"],
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
        // Ordered by the dependency chain, so setting the college up top to bottom
        // works: a Program pairs a Degree × Branch AND names the Department that
        // runs it, and a Class sits within a Program while being OWNED by a
        // department (S&H for first year, the branch's own from year 2).
        children: [
          { title: "Degrees", href: "/structure/degrees" },
          { title: "Branches", href: "/structure/branches" },
          { title: "Departments", href: "/structure/departments" },
          { title: "Programs", href: "/structure/programs" },
          { title: "Classes", href: "/structure/classes" },
        ],
      },
      {
        title: "Classes",
        href: "/structure/classes",
        icon: UsersRound,
        // A HOD runs their own department's classes — setting the class teacher
        // above all. Super Admin reaches the same page through "Structure setup"
        // above, so this entry is HOD-only to avoid listing it twice for them.
        // The API scopes it: a HOD sees only the classes their department owns.
        roles: ["HOD"],
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
        exact: true, // /faculty/attachments is a sibling entry, not this page
      },
      {
        title: "Attachments",
        href: "/faculty/attachments",
        icon: ArrowLeftRight,
        // Lending staff across departments is an institution-level act, so this is
        // Super Admin only — a HOD asks the admin. It's a sibling rather than a
        // child of Faculty because children carry no roles of their own, and an
        // HOD must not be offered a link that would 403.
        roles: ["Super Admin"],
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

/**
 * The nav a given user may see. `gate` REPLACES the role check when present;
 * an item with neither is visible to anyone signed in. Groups left with no
 * items are dropped so no empty group heading renders.
 */
export function visibleGroups(flags: NavFlags): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) =>
      i.gate ? i.gate(flags) : !i.roles || i.roles.some((r) => flags.roles.includes(r)),
    ),
  })).filter((g) => g.items.length > 0);
}

/**
 * Should this nav item read as current for `pathname`?
 *
 * Most items also light up on their sub-routes, so /structure/degrees stays
 * highlighted on a child page. `exact` opts out, and is needed wherever a
 * SIBLING owns a sub-path: without it /attendance would also claim
 * /attendance/report. /dashboard is exact by hard-coded convention rather than
 * by carrying the flag.
 */
export function isNavItemActive(item: Pick<NavItem, "href" | "exact">, pathname: string): boolean {
  if (item.exact || item.href === "/dashboard") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Resolve a path to a breadcrumb trail (Group / Page), derived from the nav so
 * it always matches the real navigation.
 *
 * Deliberately scans the WHOLE nav rather than the role-filtered set: a user who
 * reaches a page directly should still get a correct trail, and the crumbs are
 * labels, not links (see below), so this leaks no route they couldn't already
 * see in the URL bar.
 *
 * ⚠️ The group crumb carries no `href` ON PURPOSE. Because this scans unfiltered
 * NAV, a synthesised group link could point at a page the viewer's role 403s —
 * which is precisely the promise the nav exists to keep. Leave it label-only.
 *
 * Falls back to the last path segment for pages not in the nav (e.g. /admin).
 */
export function buildBreadcrumbs(pathname: string): Array<{ label: string; href?: string }> {
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
    return best.group.label === OVERVIEW_GROUP
      ? [{ label: best.item.title }]
      : [{ label: best.group.label }, { label: best.item.title, href: best.item.href }];
  }
  const last = pathname.split("/").filter(Boolean).at(-1) ?? "";
  return [{ label: last.charAt(0).toUpperCase() + last.slice(1) }];
}
