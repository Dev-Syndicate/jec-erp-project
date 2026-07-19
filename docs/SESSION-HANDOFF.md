# JEC ERP — Session Handoff

_Last updated: 2026-07-19 · Branch: `rebuild-core` · HEAD: `f40be85`_

Read this first, then open [docs/schema-design.html](./schema-design.html) (the visual
source of truth for the data model) in a browser.

---

## 1. Where we are right now

The project was **reset to be schema-first**. We threw away the reactively-built
pages/APIs and the old Department/Section/Term model, designed the complete core
data model as a reviewed visual document, locked it, and wrote it as the Prisma
schema in one clean pass.

**Done and committed (`f40be85` on `rebuild-core`, pushed to origin):**

- ✅ New Prisma schema — the **19-table backbone** (see §3). Validated, generated,
  and **pushed to the Neon dev DB** (force-reset; DB is empty except seed data).
- ✅ Seed runs green: RBAC baseline (roles **Super Admin · HOD · Faculty · Student**)
  + the bootstrapped **Super Admin** account.
- ✅ Carried-over foundation code migrated to the new model
  (`departmentId → programId`, `isActive → status`, `assertDeptScope → assertProgramScope`).
- ✅ `pnpm exec tsc --noEmit` is **clean**.

**Nothing else is built yet** — there are no management screens or feature APIs.
The nav is trimmed to just "Today → Overview". This is a bare, correct foundation.

---

## 2. THE NEXT TASK (start here)

Build the **first vertical slice: the Structure setup**, because everything else
depends on it (you can't mark attendance without a Class to mark).

Order it exactly like the dependency chain:

1. **Degree** — CRUD (name, code, `durationYears`). Super-Admin only.
2. **Branch** — CRUD (name, code). Super-Admin only.
3. **Program** — pair a Degree × Branch. `programId` is _the_ scoping key.
4. **Class** — within a Program: `year` (1…durationYears) + `section` ("A"…"H"),
   optional `advisorId`. Unique `(program, year, section)`.

Then the actual **Attendance** job can be built on top (job #1, the priority).

The user's stated preference: **commit at clean checkpoints**, build **one vertical
slice at a time**, and confirm design decisions before writing lots of code.

---

## 3. The locked data model (19 tables)

Full detail + rationale is in [docs/schema-design.html](./schema-design.html); the
schema itself is [prisma/schema.prisma](../prisma/schema.prisma). Summary:

| Group | Tables |
|-------|--------|
| **Structure** | `Degree`, `Branch`, `Program` (Degree×Branch), `Class` (year + section + `advisorId?`) |
| **People** | `User` (firebaseUid, email, `programId?`, `status`, `mustChangePassword`), `Student` (`registerNumber` unique login, `rollNumber?`, `status`), `FacultyProfile` |
| **RBAC** | `Role` (+`scope` PROGRAM/INSTITUTION, `isSystem`), `Permission` (action+subject), `UserRole`, `RolePermission` |
| **Time** | `AcademicYear`, `Semester` (`kind` ODD/EVEN — **the hub**) |
| **Placement** | `Enrollment` (student + class + year; `unique(student, year)`) |
| **Curriculum** | `Subject` (per program, `semesterNumber`), `FacultyAssignment` (who may teach/mark), `TimetableSlot` (Mon–Fri weekly grid) |
| **Records** | `MasterAttendance`, `PeriodAttendance`, `InternalMark` |

### The load-bearing ideas
- **Semester is the hub.** Every time-bound record (attendance, marks, assignments,
  timetable) points at a `Semester`. Exactly one `AcademicYear` + one `Semester`
  active at a time (enforced in app, not DB).
- **Enrollment is a yearly sticker.** A student's class is NOT a fixed field — it's
  an `Enrollment` per academic year. Promotion = a new row next year; old rows stay
  as history. A student can be onboarded at _any_ year.
- **Derived curriculum semester** (no duplicate data):
  `semesterNumber = (year − 1) × 2 + (kind == ODD ? 1 : 2)`.
  A Class in year 2 / Odd → subjects where `semesterNumber = 3`.
- **`durationYears` on Degree** drives both the Year dropdown (1…duration) and the
  Subject `semesterNumber` range (1…2×duration). Some degrees are 4 yrs, some 2.

### Attendance model (two tables — decided deliberately)
- **`MasterAttendance`** — the _official_ day attendance. One row per student per day
  (`unique(student, date)`). Drives overall attendance %. Its `status` is **set from
  period 1**: present in the first period → present for the day.
- **`PeriodAttendance`** — hour-wise, subject-level. One row per student per period
  (`unique(student, date, period)`). Feeds per-subject attendance %.
- **Write flow:** marking period 1 writes the PeriodAttendance row **and** upserts
  that student's MasterAttendance with the same status. Periods 2–8 only touch
  PeriodAttendance.

### RBAC
- Roles/permissions are **data**, composed in a UI (allow-list: "blocked" = not
  granted, no explicit deny). CASL abilities are built in code from the
  `UserRole → Role → Permission` mapping (the CASL factory `src/lib/rbac` is **not
  built yet** — routes currently gate with the stopgap `requireRole()` /
  `assertProgramScope()` in [src/lib/auth.ts](../src/lib/auth.ts)).
- **Scope:** PROGRAM roles (HOD, Faculty, Student, custom "ERP Coordinator") see only
  their own program; INSTITUTION (Super Admin) spans all.
- **Super Admin** is bootstrapped in the seed (no higher role can create it).

---

## 4. Decisions made this session (don't relitigate)

- **Register number is the student login handle** (unique, required). Roll number is
  optional. Firebase auth is email-based; `POST /api/auth/resolve-roll` maps
  registerNumber → email before Firebase sign-in.
- Name it **Faculty**, not Teacher. The class-group table is **Class**; its letter
  field is **`section`** ("A"); FK is **`classId`**.
- **Attendance is period-wise**, and **period 1 = the day marker** (two tables above).
- **Timetable = Mon–Fri only.** A working Saturday _borrows_ a weekday's grid.
  Attendance is keyed on actual `date`, not day-of-week, so Saturdays still work; the
  "today follows which weekday" mapping is a small thing to bolt on when building the
  attendance slice (no schema change — `WorkingDay { date, followsDay }` or a dropdown).
- **Deferred** (additive later, they hang off existing tables — DON'T reshape the
  backbone for them): admission detail tables (profile/guardians/address/education/
  banks/documents), bulk-import batch tables, audit log, reference lookups
  (religion/category/caste), university/exam results + GPA (out of scope — internals
  only), Subject theory/lab type, lab batches.

---

## 5. Stack + gotchas (CLAUDE.md was deleted; this is the surviving knowledge)

- **Next.js 16** App Router, route groups `(app)`, **`params` is a Promise**, one
  `route.ts` per endpoint. **React 19**, TanStack Query v5, TypeScript.
- **Base UI shadcn (NOT Radix).** Use `render={<Link/>}` prop; `nativeButton={false}`
  for link-buttons; `Select.Value` needs a `(value)=>label` render fn; height via
  `h-10!` (trailing bang).
- **Prisma 7** — `prisma-client` generator to `src/generated/prisma` (gitignored).
  Uses **prisma.config.ts**. Dev DB workflow: `prisma db push`; for destructive resets
  `--force-reset --accept-data-loss` **plus** env
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Shall I proceed with resetting the dev database? yes"`.
- **Stale Prisma client traps** (hit repeatedly): after a schema change you must
  (1) `prisma generate`, (2) **restart the dev server** (holds a stale client in
  memory), and (3) if Turbopack still errors, **`rm -rf .next`** (its cache bundles a
  stale client).
- **Neon** — WebSocket adapter (`PrismaNeon`) for transactions (HTTP mode can't do
  them); `channel_binding=require` is stripped in `src/lib/db.ts`; cold-start
  `transactionOptions: { maxWait: 15000, timeout: 20000 }`. **DB is in Singapore
  (ap-southeast-1)** — ~95ms warm (moved from Virginia, ~4× faster).
- **Auth** — Firebase Auth + Admin SDK, Bearer token. `authenticate()` in
  [src/lib/auth.ts](../src/lib/auth.ts) verifies token → resolves Neon `User` (30s
  in-memory cache keyed by uid; `invalidateAuthUser(uid)` for instant revoke). A
  verified token with no active User row is rejected.
- **Theming** — single `--brand-hue` (185 teal); semantic tokens only. Attendance
  status colors are fixed (non-brand).
- **India geo** — states/districts served from
  [src/data/india-states-districts.json](../src/data/india-states-districts.json) via
  [src/lib/india-geo.ts](../src/lib/india-geo.ts), NOT the DB.

## 6. Env / accounts
- **Testing:** use `test-admin@jeppiaar.local` for browser tests — NEVER the user's
  real admin (see auto-memory `test-admin-account`).
- Super Admin bootstrap reads `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_TEMP_PASSWORD` /
  `SUPER_ADMIN_NAME` from env; the seed reuses an existing Firebase user if present.

## 7. Commands
```
pnpm dev                       # next dev (restart after schema changes)
pnpm exec prisma generate      # regenerate client after schema edits
pnpm exec prisma db push       # sync dev DB
pnpm exec prisma db seed       # RBAC + Super Admin (idempotent)
pnpm exec tsc --noEmit         # typecheck (keep green)
```
