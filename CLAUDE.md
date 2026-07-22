# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

JEC ERP — a college ERP for Jeppiaar Engineering College. Next.js web app now; a Flutter
client is planned later against the same API. **Start every session by reading
[docs/SESSION-HANDOFF.md](docs/SESSION-HANDOFF.md)** (current state + next task) and opening
[docs/schema-design.html](docs/schema-design.html) (the visual source of truth for the data model).

## Commands

```bash
pnpm dev                       # next dev — RESTART after any schema change (holds a stale Prisma client)
pnpm build                     # next build
pnpm lint                      # eslint
pnpm exec tsc --noEmit         # typecheck — keep this green; it's the main correctness gate
pnpm exec prisma generate      # regenerate client into src/generated/prisma after schema edits
pnpm exec prisma db push       # sync dev DB (non-destructive)
pnpm exec prisma db seed       # RBAC baseline + Super Admin bootstrap (idempotent; safe to re-run)
```

Destructive dev-DB reset (wipes all data) needs both the flags and the consent env var:

```bash
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Shall I proceed with resetting the dev database? yes" \
  pnpm exec prisma db push --force-reset --accept-data-loss
```

`generate` runs automatically on `postinstall`, `predev`, and `prebuild`. There is **no test
runner configured** — Playwright is a dependency but no test scripts exist; don't invent
`pnpm test`. Verify changes with `tsc --noEmit` + running the app.

### Stale-Prisma-client traps (hit repeatedly — do all three when the client goes out of sync)
1. `pnpm exec prisma generate`
2. **Restart `pnpm dev`** — the running server holds a stale client in memory.
3. If Turbopack still errors, delete `.next` (its cache bundles a stale client).

## The security boundary (the single most important rule)

**Firebase owns identity; Neon owns authorization + all ERP data.** They meet at exactly one
field: `User.firebaseUid`.

- The client's only credential is a Firebase ID token. Every API call goes through
  [`apiFetch`](src/lib/api-client.ts), which attaches it as `Authorization: Bearer <token>`.
- Every API route's **step one** is [`authenticate(req)`](src/lib/auth.ts): verify the token
  with Firebase Admin → resolve the Neon `User` (with roles). A verified token whose uid has no
  **active** `User` row is rejected — a Firebase identity alone grants nothing.
- **Step two** is authorization in the route (see below).
- `src/lib/db.ts` and `src/lib/firebase-admin.ts` are `server-only` — importing them from client
  code leaks the connection string / service-account key into the bundle. Never do it.
- `authenticate()` caches the resolved user for **30s** keyed by uid (Neon round-trips are
  expensive). After a mutation that must revoke access instantly (role change, program move,
  deactivation), call `invalidateAuthUser(uid)` rather than waiting out the TTL.

### Authorization: CASL, data-driven (built)
Authorization is a CASL ability built per request from the user's DB `role → permission` grants
(the `/access` console edits these). The factory is [`src/lib/rbac/ability.ts`](src/lib/rbac/ability.ts);
`authenticate()` attaches the ability to the context. Routes gate with a single helper:

- [`authorize(ctx, action, subject)`](src/lib/auth.ts) — the **capability** check ("may this role
  do X at all?"). `manage` covers every action on a subject and the `all` subject covers everything,
  so `authorize(ctx, "manage", "all")` means "full/institution admin" (Super Admin only).
- [`authorize(ctx, action, subject, { programId })`](src/lib/auth.ts) — the **scoped** check. Grants
  from a PROGRAM-scoped role carry a `{ programId }` **CASL condition**, so this enforces the rule
  **Super Admin is unscoped; everyone else acts only within their own `programId`**. Use the resource
  form whenever the target's programId is known (it replaced the old `assertProgramScope`). ⚠️ The
  resource arg is optional — omitting it silently degrades to a capability-only (unscoped) check, so
  pass it on any program-owned resource.

**Never compare raw role-name strings inline** — always go through `authorize`. `ctx.isInstitutionScoped`
(is Super Admin / any INSTITUTION role) is available for list `where` filters (unscoped → all, else
`{ programId }`). Finer, resource-specific checks live beside the routes (e.g. attendance's
[`access.ts`](src/app/api/attendance/access.ts): teaches/advises, per-period ownership).

## Architecture

**Stack:** Next.js 16 App Router (route group `(app)` for authed pages), React 19, TypeScript,
TanStack Query v5, Prisma 7 + Neon Postgres, Firebase Auth, Tailwind v4. Package manager is
**pnpm**. `@/` aliases `src/`.

### Feature-sliced frontend
- `src/features/<feature>/` — self-contained: `api/`, `hooks/` (TanStack Query wrappers),
  `components/`, `types.ts`. **Features must not import from each other.** Anything cross-cutting
  (the authed fetch, db, auth) lives in `src/lib/`.
- `src/app/` — routes only. `(app)/` is the authed shell ([app-shell.tsx](src/app/(app)/app-shell.tsx):
  role-filtered nav + breadcrumbs derived from the nav config, so the UI never offers a link that
  would 403). `login/` and `theme/` are outside the shell.
- `src/components/ui/` — shared primitives. `src/lib/` — db, auth, firebase, api-client,
  provisioning, cloudinary, india-geo, utils.

### API routes
One `route.ts` per endpoint under `src/app/api/`. **`params` is a `Promise`** in Next 16 — always
`await` it. Catch thrown `AuthError` and map with [`toAuthResponse`](src/lib/auth.ts). Routes that
must not be cached set `export const dynamic = "force-dynamic"`.

### Database (Neon + Prisma)
- [`src/lib/db.ts`](src/lib/db.ts) is the **only** place the app talks to Neon — a singleton using
  the Neon **WebSocket** adapter (`PrismaNeon`), not HTTP. HTTP mode can't run transactions, and
  core flows are transactional (leave/OD approval atomically marks attendance; bulk writes;
  `upsert`). Cold-start `transactionOptions: { maxWait: 15000, timeout: 20000 }` because Neon
  free-tier compute scales to zero. `channel_binding=require` is stripped from the URL (breaks the
  WS handshake).
- **Two connection URLs:** runtime queries use `DATABASE_URL` (pooled). Migrations/introspection
  use `DIRECT_URL` (unpooled) via [prisma.config.ts](prisma.config.ts) and never go through
  `db.ts` — Prisma Migrate can't run through Neon's PgBouncer pooler.
- Generated client goes to `src/generated/prisma` (**gitignored** — regenerate, don't commit).
- The seed runs **outside Next** via `tsx`, so it can't import `server-only` modules — it builds
  its own Prisma + Firebase clients ([prisma/seed.ts](prisma/seed.ts)).
- **DB is in Singapore (ap-southeast-1)**, ~95ms warm.

### The data model (locked; see [docs/schema-design.html](docs/schema-design.html))
19-table backbone. The load-bearing ideas — internalize these before touching records:
- **Semester is the hub.** Every time-bound record (attendance, marks, timetable, assignments)
  points at a `Semester`. Exactly one `AcademicYear` + one `Semester` are active at a time —
  **enforced in app, not DB** (watch this invariant when writing those paths).
- **Program is the scoping key.** A `Program` is a `Degree × Branch` pairing; `programId` is what
  every scope check filters on.
- **Enrollment is a yearly sticker**, not a fixed field. A student's class lives in an `Enrollment`
  row per academic year. Promotion = a new row next year; old rows stay as history.
- **Curriculum semester is derived, never stored:**
  `semesterNumber = (year − 1) × 2 + (kind == ODD ? 1 : 2)`. A Class in year 2 / Odd studies
  subjects where `semesterNumber = 3`. `Degree.durationYears` bounds both the year dropdown and
  this range.
- **Attendance is two tables, deliberately.** `MasterAttendance` = the official day attendance
  (`unique(student, date)`, drives overall %). `PeriodAttendance` = hour-wise, subject-level
  (`unique(student, date, period)`, drives per-subject %). **Marking period 1 writes the
  PeriodAttendance row AND upserts that student's MasterAttendance with the same status;** periods
  2–8 only touch PeriodAttendance.
- Timetable is **Mon–Fri only**; a working Saturday borrows a weekday's grid. Attendance is keyed
  on actual `date`, not day-of-week.

### Onboarding / account provisioning
Admin provisions accounts; the user never has the admin pick their password. Pattern in
[`src/lib/provisioning.ts`](src/lib/provisioning.ts): **create the Firebase identity first, then
the linked Neon `User` (+ `Student`/`FacultyProfile`) in a transaction; if the Neon write fails,
delete the Firebase user** so the op is all-or-nothing and a retry won't collide on the email. A
generated temp password is returned once (delivered to the user), and `mustChangePassword=true`
forces a reset on first login. `regenerateTempPassword` is only safe for accounts still on their
temp password.

### Student login quirk
Students log in with **register number + password**, but Firebase authenticates on email. The
client first calls `POST /api/auth/resolve-roll` (**unauthenticated by necessity**) to map
registerNumber → email, then signs in. That route returns a deliberately generic error and never
distinguishes "unknown" from "inactive" — don't add leakage.

## UI conventions

- **Base UI shadcn, NOT Radix** (`@base-ui/react`). Key differences: use the `render={<Link/>}`
  prop instead of `asChild`; `nativeButton={false}` for link-buttons; `Select.Value` needs a
  `(value) => label` render fn; force height with a trailing bang like `h-10!`.
- Data fetching is always TanStack Query hooks wrapping `apiFetch` — never a bare `fetch` from a
  component.
- **Theming:** a single `--brand-hue` (185, teal) drives semantic tokens; use the semantic tokens,
  not raw colors. Attendance status colors are fixed (non-brand) because they encode meaning.
- **India states/districts** are served from
  [src/data/india-states-districts.json](src/data/india-states-districts.json) via
  [src/lib/india-geo.ts](src/lib/india-geo.ts), **not the DB**.

## Working style (from the project owner)

- **One vertical slice at a time**, committed at clean checkpoints. The next slice is the Structure
  setup (Degree → Branch → Program → Class), then Attendance — see SESSION-HANDOFF.md §2.
- **Confirm design decisions before writing lots of code.** Decisions already settled are in
  SESSION-HANDOFF.md §4 — don't relitigate them.
- For browser testing use `test-admin@jeppiaar.local`, **never** the owner's real admin account.

**Env:** copy [.env.example](.env.example) → `.env` (it documents every variable). Groups:
`DATABASE_URL` (pooled) + `DIRECT_URL` (unpooled) for Neon; `NEXT_PUBLIC_FIREBASE_*` (public web
config) and `FIREBASE_ADMIN_*` (server-side secret — private key on one line with literal `\n`);
`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_TEMP_PASSWORD` / `SUPER_ADMIN_NAME` (seed only); and
`CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` (student doc uploads).
