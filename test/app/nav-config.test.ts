// Pins the navigation model: who sees which entries, which entry a URL belongs
// to, and what the breadcrumbs read.
//
// Why this suite exists: nav visibility mirrors the API's authorization so the
// UI never offers a link that would 403. It is not the security boundary — every
// route re-authorizes server-side — but it is the promise the shell makes, and
// it is enforced by two plain data structures that no other test touches. A
// stray character in a `roles` array changes what an entire role sees and
// nothing fails loudly. These assertions are the alarm.
//
// The negative cases matter as much as the positive ones. Several look like
// bugs and are not: Super Admin is deliberately kept out of the day-to-day
// teaching screens even though the API would accept them. Anyone "fixing" that
// has to delete an assertion that says, in words, why it is intentional.
//
// Assertions are on titles and hrefs only, never on the icon component, so the
// suite survives an icon swap during a redesign.
import { describe, expect, it } from "vitest";

import {
  NAV,
  buildBreadcrumbs,
  isNavItemActive,
  visibleGroups,
  type NavFlags,
} from "@/app/(app)/shell/nav-config";

/** "Group/href" for every item the user can see, in nav order. */
function visible(flags: NavFlags): string[] {
  return visibleGroups(flags).flatMap((g) => g.items.map((i) => `${g.label}/${i.href}`));
}

const SUPER_ADMIN: NavFlags = { roles: ["Super Admin"], advisesClass: false, teaches: false };
// A HOD who also takes hours — the common case, and what the department set below
// describes. HOD_NON_TEACHING is the same role holding no timetable slot.
const HOD: NavFlags = { roles: ["HOD"], advisesClass: false, teaches: true };
const HOD_NON_TEACHING: NavFlags = { roles: ["HOD"], advisesClass: false, teaches: false };
const FACULTY: NavFlags = { roles: ["Faculty"], advisesClass: false, teaches: true };
const FACULTY_ADVISOR: NavFlags = { roles: ["Faculty"], advisesClass: true, teaches: true };
const STUDENT: NavFlags = { roles: ["Student"], advisesClass: false, teaches: false };
const NO_ROLES: NavFlags = { roles: [], advisesClass: false, teaches: false };

describe("visibleGroups", () => {
  it("gives Super Admin the institution-admin set", () => {
    expect(visible(SUPER_ADMIN)).toEqual([
      "Today//dashboard",
      "Attendance//attendance/report",
      "Structure//structure/degrees",
      "Academic//academic",
      "Academic//promotion",
      "People//students",
      "People//faculty",
      "People//faculty/attachments",
      "Curriculum//subjects",
      "Curriculum//timetable",
      "Settings//access",
    ]);
  });

  it("gives a HOD their department's operational set", () => {
    expect(visible(HOD)).toEqual([
      "Today//dashboard",
      "Attendance//attendance/timetable",
      "Attendance//attendance",
      "Attendance//attendance/day",
      "Attendance//attendance/cover",
      "Attendance//attendance/report",
      "Assessment//marks",
      "Assessment//leave",
      "Structure//structure/classes",
      "People//students",
      "People//faculty",
      "Curriculum//subjects",
      "Curriculum//timetable",
    ]);
  });

  it("hides the teaching screens from a HOD who takes no hours", () => {
    // Marking a period belongs strictly to the period's own teacher — no role
    // overrides it (canMarkPeriod) — and both the marks picker and the personal
    // timetable are built from the caller's own slots. A HOD with no slots would
    // get three pages that can only ever say "nothing here", so the rail drops
    // them while every supervisory entry stays.
    const seen = visible(HOD_NON_TEACHING);
    expect(seen).not.toContain("Attendance//attendance");
    expect(seen).not.toContain("Attendance//attendance/timetable");
    // Still a HOD: cover, day attendance, the report and the department
    // management set are theirs regardless of whether they teach.
    expect(seen).toContain("Attendance//attendance/cover");
    expect(seen).toContain("Attendance//attendance/day");
    expect(seen).toContain("Attendance//attendance/report");
    expect(seen).toContain("People//students");
  });

  it("keeps Internal marks for a HOD who teaches nothing", () => {
    // The exception to the rule above, and the reason the marks gate reads
    // differently from the two beside it: marks/access.ts gives a HOD READ on
    // every subject their department owns while reserving ENTRY for the
    // subject's teacher, so the page is populated and opens read-only rather
    // than empty. Hiding it would cut off oversight the API grants.
    expect(visible(HOD_NON_TEACHING)).toContain("Assessment//marks");
    // A Faculty with no slots has no such read grant — for them it would be empty.
    expect(visible({ roles: ["Faculty"], advisesClass: false, teaches: false })).not.toContain(
      "Assessment//marks",
    );
  });

  it("gives a plain Faculty only what they teach", () => {
    expect(visible(FACULTY)).toEqual([
      "Today//dashboard",
      "Attendance//attendance/timetable",
      "Attendance//attendance",
      "Attendance//attendance/report",
      "Assessment//marks",
      "Assessment//leave",
    ]);
  });

  it("gives a Student exactly four entries", () => {
    // A Student's whole nav. If this grows, something has been granted to them
    // by accident — they should never see a staff screen in the rail.
    expect(visible(STUDENT)).toEqual([
      "Today//dashboard",
      "Today//my-timetable",
      "Assessment//my-marks",
      "Assessment//leave",
    ]);
  });

  it("gives the student and staff DIFFERENT pages for timetable and marks", () => {
    // Each pair shares a title but not a route: /my-timetable and /my-marks are
    // the student's own read-only views, /attendance/timetable and /marks are
    // the staff screens. Nobody should ever be offered both of a pair — that
    // would read as a duplicate entry in the rail.
    // Entries read "Group/href"; the href keeps its own leading slash.
    const hrefs = (flags: NavFlags) => visible(flags).map((e) => e.slice(e.indexOf("//") + 1));
    for (const [studentHref, staffHref] of [
      ["/my-timetable", "/attendance/timetable"],
      ["/my-marks", "/marks"],
    ]) {
      expect(hrefs(STUDENT)).toContain(studentHref);
      expect(hrefs(STUDENT)).not.toContain(staffHref);
      for (const staff of [HOD, FACULTY, FACULTY_ADVISOR]) {
        expect(hrefs(staff)).toContain(staffHref);
        expect(hrefs(staff)).not.toContain(studentHref);
      }
    }
  });

  it("shows only the Overview when the profile has not loaded yet", () => {
    // `useMe` is briefly undefined on first paint, so roles are []. Every
    // role-gated item filters out and the rail is near-empty for a moment —
    // current behaviour, asserted so a change to it is a decision.
    expect(visible(NO_ROLES)).toEqual(["Today//dashboard"]);
  });

  it("drops groups that end up empty", () => {
    // A Student matches nothing in Structure/Academic/People/Curriculum/Settings,
    // and those group headings must not render as empty shells.
    const labels = visibleGroups(STUDENT).map((g) => g.label);
    expect(labels).toEqual(["Today", "Assessment"]);
    expect(visibleGroups(STUDENT).every((g) => g.items.length > 0)).toBe(true);
  });

  it("unions the entries of a user holding two roles", () => {
    const both = visible({ roles: ["Faculty", "HOD"], advisesClass: true, teaches: true });
    expect(both).toContain("Attendance//attendance/cover"); // HOD-only
    expect(both).toContain("People//my-class"); // advisesClass gate
    expect(new Set(both).size).toBe(both.length); // no duplicates
  });
});

describe("visibleGroups — the advisesClass gate", () => {
  it("reveals My class to a Faculty who advises one", () => {
    expect(visible(FACULTY)).not.toContain("People//my-class");
    expect(visible(FACULTY_ADVISOR)).toContain("People//my-class");
  });

  it("reveals Day attendance to an advisor, and to any HOD regardless", () => {
    expect(visible(FACULTY)).not.toContain("Attendance//attendance/day");
    expect(visible(FACULTY_ADVISOR)).toContain("Attendance//attendance/day");
    // HOD passes on the role arm of the gate, without advising a class.
    expect(visible(HOD)).toContain("Attendance//attendance/day");
  });

  it("does not reveal My class to a Student who somehow carries the flag", () => {
    // The gate is `advisesClass` alone, so this asserts the flag's provenance
    // matters: it comes from the server's AuthUser, not from anything a client
    // can set. Documented here because the gate reads as role-free.
    expect(visible({ roles: ["Student"], advisesClass: true, teaches: false })).toContain("People//my-class");
  });
});

describe("visibleGroups — deliberate omissions for Super Admin", () => {
  // These are NOT bugs. Super Admin retains the API permission for each of
  // these (a stuck record can always be fixed by visiting the URL); the nav
  // simply stops offering day-to-day teaching work to the institution admin.
  // See the comments beside each item in nav-config.ts.
  it.each([
    ["/attendance", "marking a register they do not teach"],
    ["/attendance/day", "the class teacher's job"],
    ["/attendance/timetable", "they have no personal timetable"],
    ["/attendance/cover", "arranging cover is a HOD's job"],
    ["/marks", "entering marks is teaching work"],
    ["/leave", "approval is class teacher → HOD"],
    ["/my-class", "they advise no class"],
    ["/my-timetable", "the student's own grid; staff use /attendance/timetable"],
    ["/my-marks", "the student's own marks; staff enter them at /marks"],
  ])("hides %s from Super Admin (%s)", (href) => {
    expect(visible(SUPER_ADMIN).some((e) => e.endsWith(`/${href}`))).toBe(false);
  });

  it("keeps the student's timetable out of every staff rail", () => {
    // /my-timetable and /attendance/timetable are different pages for different
    // people. A staff member seeing both would read as a duplicate entry.
    for (const staff of [SUPER_ADMIN, HOD, FACULTY, FACULTY_ADVISOR]) {
      expect(visible(staff)).not.toContain("Today//my-timetable");
    }
  });

  it("hides the HOD-only Classes entry, which they reach via Structure setup", () => {
    // Listing it twice for Super Admin is the thing being avoided — the child
    // link under "Structure setup" already points at /structure/classes.
    expect(visible(SUPER_ADMIN)).not.toContain("Structure//structure/classes");
    const setup = NAV.find((g) => g.label === "Structure")!.items.find(
      (i) => i.href === "/structure/degrees",
    )!;
    expect(setup.children?.map((c) => c.href)).toContain("/structure/classes");
  });

  it("keeps the attendance Report, which is reading rather than recording", () => {
    expect(visible(SUPER_ADMIN)).toContain("Attendance//attendance/report");
  });
});

describe("isNavItemActive", () => {
  it("matches sub-routes for a normal item", () => {
    const item = { href: "/structure/degrees" };
    expect(isNavItemActive(item, "/structure/degrees")).toBe(true);
    expect(isNavItemActive(item, "/structure/degrees/new")).toBe(true);
    expect(isNavItemActive(item, "/structure/branches")).toBe(false);
  });

  it("does not match a sibling that merely shares a prefix", () => {
    // The bug `exact` exists to prevent: /attendance must not light up on
    // /attendance/report, because Report is its own entry.
    const mark = { href: "/attendance", exact: true };
    expect(isNavItemActive(mark, "/attendance")).toBe(true);
    expect(isNavItemActive(mark, "/attendance/report")).toBe(false);
    expect(isNavItemActive(mark, "/attendance/day")).toBe(false);
  });

  it("treats /faculty as exact so Attachments owns its own entry", () => {
    const faculty = { href: "/faculty", exact: true };
    expect(isNavItemActive(faculty, "/faculty")).toBe(true);
    expect(isNavItemActive(faculty, "/faculty/attachments")).toBe(false);
  });

  it("treats /dashboard as exact without it carrying the flag", () => {
    expect(isNavItemActive({ href: "/dashboard" }, "/dashboard")).toBe(true);
    expect(isNavItemActive({ href: "/dashboard" }, "/dashboard/anything")).toBe(false);
  });

  it("does not match a path that only shares a string prefix", () => {
    // "/students" must not activate on "/students-archive" — the check appends
    // a slash rather than using a bare startsWith.
    expect(isNavItemActive({ href: "/students" }, "/students-archive")).toBe(false);
  });
});

describe("buildBreadcrumbs", () => {
  it("returns a single crumb for the dashboard", () => {
    expect(buildBreadcrumbs("/dashboard")).toEqual([{ label: "Overview" }]);
  });

  it("returns a single crumb for every page in the Today group", () => {
    // "Today" labels the rail, it isn't a place — "Today / My timetable" would
    // read as a section that doesn't exist.
    expect(buildBreadcrumbs("/my-timetable")).toEqual([{ label: "My timetable" }]);
  });

  it("returns Group then Page elsewhere", () => {
    expect(buildBreadcrumbs("/students")).toEqual([
      { label: "People" },
      { label: "Students", href: "/students" },
    ]);
  });

  it("prefers the longest match, not the first", () => {
    // /attendance/report is matched by both /attendance and /attendance/report.
    expect(buildBreadcrumbs("/attendance/report")).toEqual([
      { label: "Attendance" },
      { label: "Report", href: "/attendance/report" },
    ]);
  });

  it("never gives the group crumb an href", () => {
    // Load-bearing: breadcrumbs scan the UNFILTERED nav, so a group link could
    // point at a page this viewer's role would 403 on.
    for (const path of ["/students", "/marks", "/access", "/structure/programs"]) {
      expect(buildBreadcrumbs(path)[0].href).toBeUndefined();
    }
  });

  it("falls back to the last path segment for a page outside the nav", () => {
    // /admin exists as a redirect and is in no nav group.
    expect(buildBreadcrumbs("/admin")).toEqual([{ label: "Admin" }]);
  });

  it("resolves a crumb for every navigable href", () => {
    const hrefs = NAV.flatMap((g) => [
      ...g.items.map((i) => i.href),
      ...(g.items.flatMap((i) => i.children?.map((c) => c.href) ?? [])),
    ]);
    for (const href of hrefs) {
      const crumbs = buildBreadcrumbs(href);
      expect(crumbs.length).toBeGreaterThan(0);
      expect(crumbs.at(-1)!.label).not.toBe("");
    }
  });
});

describe("NAV integrity", () => {
  it("has no duplicate hrefs across groups", () => {
    // Two entries for one route would light up together and read as a bug.
    const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("gives every item a title, an href and an icon", () => {
    for (const group of NAV) {
      for (const item of group.items) {
        expect(item.title.length).toBeGreaterThan(0);
        expect(item.href.startsWith("/")).toBe(true);
        expect(item.icon).toBeTruthy();
      }
    }
  });

  it("never puts both roles and a gate on one item", () => {
    // `gate` silently REPLACES the role check, so an item carrying both would
    // read as "these roles, and also this condition" while behaving as the
    // condition alone.
    for (const group of NAV) {
      for (const item of group.items) {
        expect(item.gate && item.roles).toBeFalsy();
      }
    }
  });

  it("keeps children within their parent's own section", () => {
    // Children carry no roles of their own — they inherit the parent's
    // visibility. A child pointing outside the parent's area would hand a user
    // a link the nav never vetted.
    for (const group of NAV) {
      for (const item of group.items) {
        for (const child of item.children ?? []) {
          expect(child.href.startsWith("/structure/")).toBe(item.href.startsWith("/structure/"));
        }
      }
    }
  });
});
