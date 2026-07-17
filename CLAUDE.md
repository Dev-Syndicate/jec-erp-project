@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

The Next.js app is scaffolded **at the repository root** (not in a `web/` subfolder as the PRD's folder tree suggests — the backend API routes and web frontend live in `src/app/` here). Next.js 16 + React 19 + TypeScript + Tailwind v4 + ESLint, App Router, `src/` dir, `@/*` import alias, Turbopack.

shadcn/ui is initialized (`components.json`, `src/components/ui/`). **This shadcn version is built on Base UI, not Radix** — the install pulled `@base-ui/react` and there are no `@radix-ui/*` packages. Snippets from most shadcn tutorials import from `@radix-ui/react-*` and will not resolve; read the generated component source instead of trusting recalled examples. Add components with `npx shadcn@latest add <name>`.

Nothing from the PRD's data layer exists yet: no Prisma schema, no Neon connection, no Firebase wiring, no CASL, no Flutter project.

```bash
npm run dev      # dev server (Turbopack)
npm run build
npm run start
npm run lint     # eslint
```

There is no test runner yet — add one and document the single-test invocation here when you do. The PRD's `mobile/` Flutter project also has no equivalent yet.

## Feature-folder architecture

Code is organized **by feature, not by layer**. `src/features/<feature>/` exists for all nine PRD features (auth, attendance, leave, timetable, departments, students, roles, announcements, reports), each with the same internal contract:

```
src/features/<feature>/
├── components/   # UI used only by this feature
├── hooks/        # TanStack Query hooks — the feature's data access
├── api/          # typed client-side fetchers hitting /api/<feature>
└── types.ts      # types owned by this feature
```

Rules that keep this from rotting:

- **Features must not import from each other.** If two features need the same thing, it belongs in `src/components/ui/` (shadcn primitives), `src/lib/` (cross-cutting: db, firebase-admin, rbac, cloudinary), or `src/types/` (shared DTOs).
- **`src/app/` stays thin.** Route files compose feature components and own routing/layout only — no business logic or data fetching in the page.
- **`src/app/api/` is the backend** and is exempt from feature imports in the other direction: server code never imports from `src/features/` (that's client code).
- Folders are currently skeletal (`.gitkeep` + a stub `types.ts`). Fill them in as phases land; don't relocate the structure.

## Theming — one hue drives the whole site

All color lives in [src/app/globals.css](src/app/globals.css). `--brand-hue` (currently `185`, teal) is declared once in `:root` and is **the single source of truth**; `--primary`, `--ring`, `--accent`, `--sidebar-*`, and `--chart-*` all derive from it via `oklch(L C var(--brand-hue))`. Changing that one number re-skins the site in both light and dark mode.

- **`.dark` deliberately does not redeclare `--brand-hue`** — it inherits it through the cascade and only lifts lightness. Redeclaring it there breaks the single-source property. (Note: shadcn's stock theme *inverts* primary in dark mode to near-white; that was replaced on purpose.)
- **Never hardcode a color in a component** — no `bg-teal-600`, no `text-zinc-900`, no hex. Use the semantic tokens (`bg-primary`, `text-muted-foreground`, `border-border`, `bg-accent`). A hardcoded color is a surface that won't follow the brand, which defeats the whole setup. The stock `create-next-app` page was rewritten for exactly this reason.
- **Attendance status colors are intentionally NOT brand-derived.** `--status-present|absent|od|excused` use fixed hues because they encode meaning — they must stay green/red/amber even if the brand becomes green. Never use color as the only signal; pair with a label or icon (colorblind users, printed reports).
- **Tailwind scans source text**, so computed class names like `` `bg-${status}` `` are never generated. Map to full literal class strings.
- To add a token: define the variable in both `:root` and `.dark`, then map it under `@theme inline` as `--color-<name>` to get the `bg-<name>`/`text-<name>` utilities.

[src/app/page.tsx](src/app/page.tsx) is a temporary theme preview (brand swatches, status pills, chart ramp, dark toggle) — useful for eyeballing a hue change; delete once real dashboards land.

## The security boundary (non-negotiable)

This is the single most important constraint in the project, and the PRD is emphatic about it:

```
Flutter ─┐
         ├─ Firebase Auth ──> ID token (per-user JWT, expiring)
Next.js ─┘
                │  token + request
                ▼
    Next.js API routes  ── verify token (Firebase Admin SDK)   "who are you"
                        ── enforce RBAC via CASL               "what can you do"
                        ── hold Neon + Cloudinary secrets SERVER-SIDE
                ▼
          Neon Postgres   (never reachable from any client)
```

- The Neon connection string and Cloudinary secret must **never** reach a client — not hardcoded in Flutter, not fetched from Firebase at runtime, not returned in an API response. Anything that reaches a phone is extractable via decompilation or a network proxy.
- Firebase tokens are the *only* credential clients hold. They are safe there because they are per-user, expiring, and useless except against our permission-checking API.
- Separation of concerns: **Firebase = identity. Our API + Neon = authorization + all ERP data.** A `User` row in Neon links a Firebase `uid` to role, department, and class assignments.
- Every API route follows the same shape: verify Firebase token → build CASL ability from the user's role → check permission and apply dept/class scoping → Prisma query. Do not write a route that skips a step.

## Tech stack (decided — see PRD "Explicitly Rejected Approaches" before proposing alternatives)

Firebase Auth (email/password only, no SMS OTP) · FCM · Next.js API routes as the backend · Neon Postgres · Prisma with the Neon serverless HTTP driver · CASL for RBAC · Cloudinary for images · Tailwind + shadcn/ui + TanStack Query on web · Flutter with flutter_bloc, dio, get_it, go_router, flutter_secure_storage on mobile.

Two decisions worth knowing before you touch infrastructure:

- **AWS Lambda + API Gateway is an accepted alternative** to Next.js API routes, and the decision is deliberately deferred — clients talk to an HTTP API either way. The recommendation is to start on Next.js routes. Lambda + Neon is fine; Lambda + **RDS** (needs RDS Proxy + NAT Gateway, ~₹3,000/mo) and Lambda + **Django** are rejected.
- **Vercel Hobby forbids commercial use.** Use it for dev/demo only; production runs on Render or Cloudflare Pages (commercial-allowed free tiers).

The driving constraint throughout is cost: near ₹0 to start, every service on a commercial-use-permitted free tier. Keep images in Cloudinary, never in the database — Neon's free 0.5 GB depends on it.

## Authorization model — the part that's easy to get wrong

**Role ≠ account.** A person has one permanent account tied to their own email; the account never changes. A role is assigned *to* that person and can be revoked or reassigned at any time. HOD in particular is a role assignment, not an account — when the HOD rotates yearly, the Super Admin revokes the role from Person A and grants it to Person B. Both keep their accounts, and historical records still attribute past actions to Person A. Never model role rotation as creating a new account.

Scoping rules enforced in API guards/services:

| Role | Scope |
|---|---|
| Super Admin | No department filter — all data, all departments. Sole authority to create departments, assign HODs, and manage roles/permissions. Seeded once via a protected script (no higher role exists to create it). |
| HOD | Own department only — every query filtered `WHERE departmentId = user.departmentId`. Cannot manage roles or other departments. |
| Teacher | Attendance limited to sections in their `TeacherAssignment`. |
| Student | Read-only, own records only. |

RBAC is **configurable**, not fixed: `Role` and `Permission` live in the database and admins compose custom roles through a UI. CASL abilities are built in code from that mapping.

**Onboarding is uniform for staff and students:** the admin provisions an account, the system generates a temporary password and emails it, and a `mustChangePassword` flag forces a reset on first login. The admin never sets or holds the real password. Students log in with **roll number + password** but each account is backed by a real student email — that email is the Firebase identity and the secure password-delivery channel. This matters specifically because of the leave/OD approval flow: a private-inbox password plus a notification on submit is what makes impersonation hard. A guessable default like DOB would break that. Fallback for students with no email on file: self-activation via roll number + DOB + admission number.

## Data model and cross-cutting concerns

These are designed in from the start rather than retrofitted, and new features are expected to respect them:

- **Academic-year scoping** — the PRD calls this "the single most important structural decision." An `AcademicYear`/`Term` entity is referenced by `Enrollment`, `Timetable`, `Attendance` (and future Marks/Fees). A student's section is an `Enrollment` *per year*, which is what makes yearly promotion and HOD/teacher rotation work without duplicating accounts or tangling history. All time-bound queries scope to the active term.
- **Audit logging** — an `AuditLog` (actor, action, entity, before/after, timestamp, source) covers attendance, leave, roles, and announcements.
- **Soft deletes** — students and staff are marked inactive, never hard-deleted.
- **Data export** — Excel/PDF is a first-class recurring need, not an afterthought.
- **Bulk operations** — student CSV import, bulk attendance, bulk promote-to-next-year, bulk role/section assignment.

Backbone entities: `Department 1─∞ Class 1─∞ Section 1─∞ Enrollment ∞─ Student`; `User ∞─∞ Role ∞─∞ Permission`; plus `TeacherAssignment` (gates who may mark attendance), `Timetable`, `Attendance`, `LeaveRequest`, `Announcement`, `AuditLog`.

Timetable and `TeacherAssignment` are what authorize attendance marking for a given period — attendance permission is derived from them, not granted directly.

Leave/OD is a **two-step approval**: class teacher approves, then HOD. Only on final approval do the affected dates auto-mark as OD/Excused in attendance. A rejection at either step must leave attendance untouched.

## Build order

The PRD sequences 14 phases; the dependency spine is: Prisma schema (with AcademicYear + Enrollment + AuditLog + soft-delete flags from day one) → auth flow → RBAC core + seeded Super Admin → admin console → org structure + users → timetable/TeacherAssignment → attendance → leave/OD → reports → announcements → media → notifications → audit + bulk ops → clients. Later phases assume the earlier structural ones are in place; don't build attendance before academic-year scoping exists.

The PRD's "Verification" section lists the specific negative tests that define correctness (teacher marking a non-assigned section must be denied, HOD reading another department must be denied, role rotation must immediately revoke access while preserving historical attribution). Treat those as the acceptance criteria for the corresponding phases.

## Future roadmap

Marks/exams, fees, assignments, parent access, academic calendar, dashboards, timetable conflict detection, and placement are deliberately deferred but are expected to hang off the existing core additively. If a Phase-1 design choice would box these out, that's a signal the choice is wrong.
