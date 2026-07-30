# JEC ERP — Session Handoff

_Last updated: 2026-07-30 · Branch: `rebuild-core` · HEAD: `aeb7300`_

Read this first, then open [docs/schema-design.html](./schema-design.html) (the visual
source of truth for the data model) in a browser.

---

## 1. Where we are right now

The schema-first rebuild is **essentially complete**: every one of the 19 backbone
tables (§3) now has a working vertical slice — API + feature UI + RBAC scoping.
`tsc --noEmit`, `eslint`, and `next build` are all green.

**Built and committed on `rebuild-core` (pushed to origin):**

- ✅ **Structure** — Degree → Branch → Program → Class CRUD (`/structure/*`).
- ✅ **Academic** — AcademicYear + Semester, one-active-at-a-time activation; Promotion.
- ✅ **People** — Students + Faculty provisioning (Firebase-first, temp password,
  `mustChangePassword`); server-side paginated + searched lists, program-scoped.
- ✅ **RBAC** — CASL abilities from DB grants; the `/access` console edits them; program
  scoping via `authorize(..., { programId })`; role-assign subset rule.
- ✅ **Curriculum** — Subjects (per program, derived `semesterNumber`); Timetable (Mon–Fri
  grid; a working Saturday borrows a weekday).
- ✅ **Attendance** — mark (period-wise; period 1 seeds MasterAttendance), Day-record
  correction (class teacher), Report (overall % + per-subject + defaulters).
- ✅ **My class** — the class advisor's roster view/edit + student temp-password reset.
- ✅ **Internal Marks** — IA1/IA2/Model/Assignment entry, scoped from the **timetable**
  (who teaches what), student sees them on their portal.
- ✅ **Leave / OD** — student applies → class teacher → HOD two-stage approval → final
  approval writes attendance (OD/EXCUSED); strict stage order.
- ✅ **Student portal** — self-scoped Overview (attendance %, timetable, marks); dashboards
  route Student → StudentDashboard, staff → DashboardHome.

Auto-memory (`~/.claude/.../memory/MEMORY.md`) has a one-line index of every feature's
design decisions — read it for the "why".

### Real college data is loaded (2026-07-30)

The demo/seed data was wiped and replaced with the college's actual CSE records from
`CSE ERP Data.xlsx` + `CSE_Faculty Details.xlsx`. **The DB no longer contains fake
students** — treat it as production-shaped data.

| | |
|---|---|
| Students | **473** across 8 classes (2-A 60, 2-B 60, 2-C 56, 3-A 50, 3-B 53, 3-C 54, 4-A 69, 4-B 71) |
| Faculty | **13** (staffIds `CSE001`–`CSE013`, all `@jeppiaarcollege.org`) |
| Structure | B.E × CSE, one Program; AcademicYear **2025-2026** active, **ODD** semester active |
| Preserved | `adminjec@jeppiar.com` + `test-admin@jeppiaar.local` (Super Admins), the 4 roles + 28 permissions |
| Not yet loaded | Subjects, timetable, faculty assignments, attendance, marks — all empty |

Scripts live in [scripts/import/](../scripts/import/):
- `xlsx-source.ts` — parsing/normalisation (Excel-serial + text dates, phone, email repair)
- `wipe.mts` — destructive reset; keeps INSTITUTION-scoped users + RBAC. Needs `--yes`
- `seed-cse.mts` — the import. Supports `--dry-run`; **resumable** (skips emails that
  already exist), Firebase-first-then-Neon per account with rollback

**13 rows were rejected**, not guessed at — see `prisma/data/import-rejected.csv`
(gitignored): 5 corrupt dates of birth (Excel serials pointing at 2024–2026), 4 duplicate
emails, 1 duplicate register number, 1 blank register number, 2 malformed emails. Register
number and email are the login handles, so a collision has no safe default. Fix the
spreadsheet and re-run `seed-cse.mts` to add them — it will skip everyone already imported.

⚠️ `prisma/data/import-credentials.csv` holds **485 one-time temp passwords** in plaintext
(every account has `mustChangePassword=true`). Deliver them, then delete the file. It and
the `.xlsx` sources are gitignored.

---

## 2. THE NEXT TASK (candidates — confirm with the owner)

With real data loaded, the most valuable next slice is **curriculum for the live
classes** — Subjects, then the Timetable, then FacultyAssignments. Those three are
empty, and attendance/marks (already built) cannot be exercised on real students until
the timetable exists. The college has not yet supplied a subject/timetable sheet.

Other open candidates, unchanged:

- **Announcements** — staff post to students/faculty, scoped by program/class. Greenfield:
  needs a schema addition (no table yet — it was in the "deferred" list) + design pass.
  The `src/features/announcements` slice is an empty stub.
- **Reports / export hub** — consolidated attendance + marks with CSV/PDF export for
  HOD/admin. Uses existing data, no schema change. `src/features/reports` is an empty stub.
- **Student-experience polish** — surface Leave/OD on the StudentDashboard (students reach
  `/leave` only via the sidebar today); optionally hide HOD-role users from the Faculty page.

Working style unchanged: **one vertical slice at a time**, commit at clean checkpoints,
**confirm design decisions before writing lots of code**.

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
- Roles/permissions are **data**, composed in the `/access` UI (allow-list: "blocked" =
  not granted, no explicit deny). CASL abilities are built in code from the
  `UserRole → Role → Permission` mapping by [src/lib/rbac/ability.ts](../src/lib/rbac/ability.ts);
  `authenticate()` attaches the ability. Routes gate with `authorize(ctx, action, subject,
  { programId? })` (and the non-throwing `can(...)`) in [src/lib/auth.ts](../src/lib/auth.ts).
  The old `requireRole()` / `assertProgramScope()` stopgaps are **retired**.
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
