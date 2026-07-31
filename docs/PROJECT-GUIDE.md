# JEC ERP — Project Guide

Orientation for anyone (human or agent) picking up this codebase. It describes how the
system is **built and why**, not what happened in any particular session.

- [CLAUDE.md](../CLAUDE.md) — the working rules (commands, conventions, the security
  boundary). Read it first; this guide is the deeper map.
- [docs/schema-design.html](./schema-design.html) — visual source of truth for the data
  model. Open it in a browser before changing anything schema-shaped.
- [prisma/schema.prisma](../prisma/schema.prisma) — the schema itself.

A college ERP for Jeppiaar Engineering College. Next.js web app today; a Flutter client is
planned later against the same API, which is why all logic lives behind HTTP routes rather
than in server components.

---

## 1. Orientation in five minutes

**The one-sentence architecture:** Firebase proves *who you are*, Neon decides *what you may
do*, and the two meet at exactly one field — `User.firebaseUid`.

**The one-sentence data model:** `Semester` is the hub every time-bound record hangs off,
`Program` is the key every permission check scopes on, and a student's class is a yearly
`Enrollment` row rather than a fixed field.

Four invariants are enforced in application code, not by database constraints. Nothing stops
you from violating them, so check them by hand whenever you touch these paths:

| Invariant | Where it lives |
|---|---|
| Exactly one `AcademicYear` + one `Semester` active at a time | activate routes under `academic-years/[id]/activate`, `semesters/[id]/activate` |
| Marking period 1 also upserts that student's `MasterAttendance` | [src/app/api/attendance/route.ts](../src/app/api/attendance/route.ts) |
| `semesterNumber = (year − 1) × 2 + (kind == ODD ? 1 : 2)` — derived, never stored | subjects + timetable + marks queries |
| Non-Super-Admin acts only within their own `programId` | every `authorize(ctx, …, { programId })` call |

---

## 2. Layout

```
src/
  app/
    (app)/          authed shell — role-filtered nav + breadcrumbs (app-shell.tsx)
    api/            46 route.ts endpoints — the whole public surface
    login/ theme/   outside the shell
  features/<name>/  18 slices, each: api/ components/ hooks/ types.ts
  components/ui/    shared primitives (Base UI shadcn)
  lib/              db, auth, rbac/, firebase, api-client, provisioning, cloudinary, india-geo
  generated/prisma/ generated client — GITIGNORED, never edit or commit
scripts/import/     one-off college-data import (see §7)
```

**Two layering rules that are currently unbroken — keep them that way:**

1. **Features never import from each other.** All 18 slices are clean today. Anything two
   features need goes in `src/lib/` or `src/components/ui/`.
2. **`src/lib/db.ts` and `src/lib/firebase-admin.ts` are `server-only`.** Importing either
   from client code leaks the connection string / service-account key into the browser
   bundle. Currently nothing outside `src/lib/` and `src/app/api/` imports `db`.

Components never call bare `fetch` — always a TanStack Query hook wrapping
[`apiFetch`](../src/lib/api-client.ts), which attaches the Firebase token.

---

## 3. The security boundary

This is the part most worth understanding before writing a route.

**Every API route has two steps.** Step one is [`authenticate(req)`](../src/lib/auth.ts):
verify the Firebase ID token, then resolve the Neon `User` and roles. A valid token whose
uid has no **active** `User` row is rejected — a Firebase identity alone grants nothing.
Step two is authorization in the route body.

Authorization is [CASL](../src/lib/rbac/ability.ts), built per request from the user's
DB `role → permission` grants (edited live in the `/access` console — permissions are
**data**, an allow-list; "blocked" means not granted, there is no explicit deny).

```ts
authorize(ctx, "read", "Student")                    // capability: may this role do X at all?
authorize(ctx, "read", "Student", { programId })     // scoped: …and is it inside their program?
authorize(ctx, "manage", "all")                      // full institution admin (Super Admin)
can(ctx, …)                                          // same checks, non-throwing
```

⚠️ **The resource argument is optional, and omitting it silently degrades to an unscoped
check.** That is the single easiest way to introduce a real security bug here — a Faculty
member reading another program's students. Pass `{ programId }` on every program-owned
resource. `test/lib/authorize.test.ts` pins both forms, but no test can tell whether a given
route *remembered* to pass the resource — that stays a review checkpoint (§8).

Never compare role-name strings inline; always go through `authorize`. For list `where`
filters use `ctx.isInstitutionScoped` (unscoped → all rows, else `{ programId }`).

Resource-specific rules that CASL can't express live beside their routes — see
[src/app/api/attendance/access.ts](../src/app/api/attendance/access.ts)
(`assertTeachesOrAdvises`, `assertMarksPeriod`, `assertOwnsDayRecord`): who teaches a period,
who advises a class.

**Deliberate exceptions — don't "fix" these:**

- [`api/auth/resolve-roll`](../src/app/api/auth/resolve-roll/route.ts) is the only route
  without `authenticate()`, and necessarily so: students log in with a register number, but
  Firebase authenticates on email, so this maps one to the other *before* sign-in. It returns
  a deliberately generic error and never distinguishes "unknown" from "inactive". Don't add
  leakage.
- The `/me` and `auth/*` routes have no `authorize()` call because they are **self-scoped by
  construction** — they resolve the subject from `ctx.user` and never accept an id from the
  client. Preserve that property if you edit them.

`authenticate()` caches the resolved user for **30s** keyed by uid, because Neon round-trips
are expensive. After any mutation that must revoke access immediately — role change, program
move, deactivation — call `invalidateAuthUser(uid)` rather than waiting out the TTL.

---

## 4. Data model (21 tables)

| Group | Tables |
|-------|--------|
| **Structure** | `Degree`, `Branch`, `Program` (Degree×Branch), `Class` (year + section + `advisorId?`) |
| **People** | `User` (firebaseUid, email, `programId?`, status, mustChangePassword), `Student` (`registerNumber` = login handle), `FacultyProfile` |
| **RBAC** | `Role` (scope PROGRAM/INSTITUTION), `Permission`, `UserRole`, `RolePermission` |
| **Time** | `AcademicYear`, `Semester` (kind ODD/EVEN — the hub) |
| **Placement** | `Enrollment` (`unique(student, year)`) |
| **Curriculum** | `Subject` (per program, `semesterNumber`), `FacultyAssignment`, `TimetableSlot` |
| **Records** | `MasterAttendance`, `PeriodAttendance`, `InternalMark`, `LeaveRequest` |

**Semester is the hub.** Attendance, marks, timetable and assignments all point at a
`Semester`. Almost any query you write will be filtered by the active one.

**Enrollment is a yearly sticker, not a field.** A student's class lives in an `Enrollment`
row per academic year. Promotion writes a *new* row; old rows stay as history, so a student
can be onboarded at any year and their past placement remains queryable.

**Curriculum semester is derived, never stored:**
`semesterNumber = (year − 1) × 2 + (kind == ODD ? 1 : 2)`. A Class in year 2 during an ODD
semester studies subjects where `semesterNumber = 3`. `Degree.durationYears` bounds both the
year dropdown (1…duration) and this range (1…2×duration) — degrees are not all 4 years.

**Attendance is two tables, deliberately.**

- `MasterAttendance` — the *official* day record, `unique(student, date)`, drives overall %.
- `PeriodAttendance` — hour-wise and subject-level, `unique(student, date, period)`, drives
  per-subject %.
- **Write flow:** marking **period 1** writes the PeriodAttendance row *and* upserts that
  student's MasterAttendance with the same status. Periods 2–8 touch PeriodAttendance only.
  The class teacher (`Class.advisorId`) can afterwards correct the day record.

**Timetable is Mon–Fri only.** A working Saturday borrows a weekday's grid. Attendance is
keyed on the actual `date`, never day-of-week, so Saturdays work correctly.

---

## 5. What exists

Every table has a working vertical slice — API + feature UI + RBAC scoping.

| Area | Pages | Notes |
|---|---|---|
| Structure | `/structure/{degrees,branches,programs,classes}` | Degree → Branch → Program → Class |
| Academic | `/academic`, `/promotion` | year + semester, one-active-at-a-time |
| People | `/students`, `/faculty` | provisioning, paginated + searched, program-scoped |
| RBAC | `/access` | edits the role→permission grants CASL reads |
| Curriculum | `/subjects`, `/timetable` | derived `semesterNumber`; Mon–Fri grid |
| Attendance | `/attendance`, `/attendance/day`, `/attendance/report` | mark, correct, report + defaulters |
| My class | `/my-class` | advisor roster view/edit + student password reset |
| Marks | `/marks` | IA1/IA2/Model/Assignment — scoped from the **timetable**, not `FacultyAssignment` |
| Leave / OD | `/leave` | student → class teacher → HOD; final approval writes attendance |
| Student portal | `/dashboard` | self-scoped; routes Student → StudentDashboard, staff → DashboardHome |

**Stubs — directory + `types.ts` only, no implementation:** `src/features/announcements`
(needs a schema addition; no table yet) and `src/features/reports` (consolidated
attendance + marks export; needs no schema change).

---

## 6. Account provisioning

An admin provisions accounts and never picks the user's password. The pattern in
[src/lib/provisioning.ts](../src/lib/provisioning.ts) is **Firebase first, then Neon in a
transaction, and delete the Firebase user if the Neon write fails** — so the operation is
all-or-nothing and a retry won't collide on the email.

A generated temp password is returned **once** for delivery, and `mustChangePassword=true`
forces a reset at first login. `regenerateTempPassword` is only safe for accounts still on
their temp password.

### Editing sign-in details

Identity fields are editable for both students and faculty, each through their own route
only — [`PATCH /api/students/[id]`](../src/app/api/students/[id]/route.ts) and
[`PATCH /api/faculty/[id]`](../src/app/api/faculty/[id]/route.ts).

**Faculty** (`staffId`, `email`): faculty sign in with their **email directly**, with no
register-number step, so email is the credential and `staffId` is only an administrative
college id. Both are `@unique`; the email follows exactly the same Firebase-sync-and-rollback
rule as the student email below.

**Students** (`registerNumber`, `email`) behave differently from each other:

- **`registerNumber` is Neon-only.** Login resolves it fresh on every sign-in via
  `/api/auth/resolve-roll`, so the student simply uses the new number next time.
- **`email` lives in both systems.** Firebase authenticates on it; Neon stores the copy
  `resolve-roll` hands the client. If the two diverge, **login breaks silently** — the client
  gets an address Firebase doesn't know. So the route commits Neon first, calls
  `updateFirebaseEmail` after, and **rolls the Neon email back** if Firebase rejects it
  (usually `auth/email-already-exists`). This is the mirror image of the provisioning pattern
  above: whichever system is written second is the one that must be undone.

Both are `@unique`, so a clash returns **409** with which handle is taken, and an email change
calls `invalidateAuthUser` so the 30s auth cache can't serve the stale identity.

⚠️ **[`/api/roster`](../src/app/api/roster/route.ts) deliberately refuses both fields.** A class
advisor may correct a name, roll number, phone, DOB or gender for their own class, but not
change what a student signs in with. It parses into an allowlist, so identity keys are ignored
rather than rejected — if you add fields there, keep identity out.

---

## 7. The real-data import

The database holds the college's **actual CSE records** — 473 students across 8 classes and
13 faculty (`CSE001`–`CSE013`). Demo data was wiped on 2026-07-30. **Treat every row as
PII.** Structure is B.E × CSE, one Program, AcademicYear 2025-2026 / ODD active. Subjects,
timetable, faculty assignments, attendance and marks were not part of the import.

Scripts in [scripts/import/](../scripts/import/):

- `xlsx-source.ts` — parsing + normalisation (Excel-serial and text dates, phone, email repair)
- `wipe.mts` — destructive reset; preserves INSTITUTION-scoped users + RBAC. Requires `--yes`
- `seed-cse.mts` — the import. Supports `--dry-run`, and is **resumable** (skips emails that
  already exist), Firebase-first-then-Neon per account with rollback

**Rejected rows are reported, never guessed at.** 13 rows were rejected to
`prisma/data/import-rejected.csv` (gitignored): corrupt dates of birth, duplicate emails,
duplicate and blank register numbers, malformed emails. Register number and email are login
handles, so a collision has no safe default — fix the spreadsheet and re-run.

> ⚠️ **Open action:** `prisma/data/import-credentials.csv` currently exists and holds ~485
> one-time temp passwords in plaintext. It is gitignored, but it should be delivered and then
> **deleted** — it has been sitting on disk since the import.

---

## 8. Health and tests

Measured, not assumed: **0** `any` / `as any` / `@ts-ignore` / `eslint-disable` in
hand-written code (every such hit is in the generated Prisma client), `tsc --noEmit` clean,
**0** cross-feature imports, **0** bare `fetch` in components, all 18 slices structurally
uniform.

```bash
pnpm test          # vitest run — 149 unit tests, <1s
pnpm test:watch    # watch mode
pnpm exec tsc --noEmit   # still the main correctness gate
```

**The suite is unit-only and never touches the database or Firebase.** That is enforced, not
merely intended: [vitest.config.mts](../vitest.config.mts) aliases `@/lib/db` and
`@/lib/firebase-admin` to stubs in [test/stubs/](../test/stubs/) that **throw** on any access,
so a test that wanders into the DB fails loudly instead of connecting to a database holding
473 real students' PII. `test/stubs/stubs.test.ts` asserts those guards still work.

| Suite | Covers |
|---|---|
| `test/rbac/ability.test.ts` | CASL wildcards (`manage`, `all`), `{ programId }` conditions, deny-by-default, allow-list semantics |
| `test/lib/authorize.test.ts` | `authorize`/`can`: capability vs scoped form, cross-program refusal, 403 shape, message doesn't leak what was checked |
| `test/lib/semester-derivation.test.ts` | `semesterNumber ⇄ (year, kind)` round-trip across 2- and 4-year degrees |
| `test/lib/student-import.test.ts` | Parsing, date/gender normalisation, required fields, in-file duplicates, row cap — the reject-never-guess rule |
| `test/api/student-patch.test.ts` | `PATCH /api/students/[id]` body rules — a login handle may never be blanked, email shape matches the importer |
| `test/api/faculty-patch.test.ts` | `PATCH /api/faculty/[id]` body rules — staff ID and the faculty sign-in email |
| `test/lib/prisma-errors.test.ts` | P2002/P2003/P2025 classification and hostile inputs |
| `test/lib/india-geo.test.ts` | State/district lookup, sorting, case-insensitivity |

Two behaviours are pinned deliberately because they are traps rather than features — both
tests say so in a comment:

- **`authorize` without a resource silently degrades to unscoped** (§3). The test asserts
  today's behaviour so the scoped/unscoped difference stays visible in the suite.
- **Excel serial dates are read as display strings.** `parseStudentSheet` reads the grid with
  `raw: false`, so a DOB cell formatted `yyyy-mm-dd` or `dd-mm-yyyy` imports fine but one
  formatted `m/d/yy` (a common Excel default) is **rejected** — its 2-digit year matches no
  pattern. Rejecting beats guessing 5 Nov vs 17 May on a date of birth, but it means an admin
  may need to reformat the DOB column before importing. This likely explains several of the
  corrupt-date rejects in §7.

**Still uncovered:** everything that needs a database — the period-1 attendance rule, the
two-stage leave order, the one-active-semester invariant, and whether each route actually
passes `{ programId }`. Those live in route handlers and would need an integration suite
against a **throwaway** database. Do not point one at the dev DB.

---

## 9. Gotchas that have bitten before

**Stale Prisma client** — after any schema change do all three: (1) `pnpm exec prisma
generate`, (2) **restart `pnpm dev`** (the running server holds a stale client in memory),
(3) if Turbopack still errors, delete `.next` (its cache bundles one too).

**Next.js 16** — `params` is a **Promise**; always `await` it. Routes that must not be cached
set `export const dynamic = "force-dynamic"`.

**Neon** — [db.ts](../src/lib/db.ts) is the only place the app talks to the database, via the
**WebSocket** adapter (`PrismaNeon`). HTTP mode cannot run transactions and core flows are
transactional. `channel_binding=require` is stripped (it breaks the WS handshake). Cold-start
`transactionOptions: { maxWait: 15000, timeout: 20000 }` because free-tier compute scales to
zero. Two URLs: `DATABASE_URL` (pooled) for runtime, `DIRECT_URL` (unpooled) for migrations —
Prisma Migrate cannot run through Neon's PgBouncer pooler. DB is in Singapore, ~95ms warm.

**Base UI shadcn, NOT Radix** (`@base-ui/react`) — use `render={<Link/>}` instead of
`asChild`, `nativeButton={false}` for link-buttons, `Select.Value` needs a `(value) => label`
render fn, and force height with a trailing bang (`h-10!`).

**The seed runs outside Next** via `tsx`, so it cannot import `server-only` modules — it
builds its own Prisma + Firebase clients ([prisma/seed.ts](../prisma/seed.ts)).

**Theming** — one `--brand-hue` (185, teal) drives semantic tokens; use the tokens, not raw
colors. Attendance status colors are intentionally fixed and non-brand: they encode meaning.

**India states/districts** come from
[src/data/india-states-districts.json](../src/data/india-states-districts.json) via
[src/lib/india-geo.ts](../src/lib/india-geo.ts) — not the database.

---

## 10. Settled decisions — don't relitigate

- **Register number is the student login handle** (unique, required); roll number is optional.
- Naming: **Faculty** not Teacher; the class-group table is **Class**, its letter field is
  **`section`**, its FK is **`classId`**.
- **Attendance is period-wise, and period 1 is the day marker** (§4).
- **Timetable is Mon–Fri**; a working Saturday borrows a weekday.
- Marks scope comes from the **timetable** (who actually teaches the period), not
  `FacultyAssignment`.
- **Deferred, additive later — do NOT reshape the backbone for these:** admission detail
  tables (profile/guardians/address/education/banks/documents), bulk-import batch tables,
  audit log, reference lookups (religion/category/caste), university results + GPA (out of
  scope — internals only), Subject theory/lab type, lab batches.

**Working style:** one vertical slice at a time, committed at clean checkpoints. Confirm
design decisions before writing lots of code.

**Testing accounts:** use `test-admin@jeppiaar.local` for browser testing — **never** the
owner's real admin account.
