# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: greenfield

The repository currently contains only [PRD.md](PRD.md) — no code, no `package.json`, no Prisma schema, no Flutter project, and it is not yet a git repository. There are no build, lint, or test commands yet because nothing has been scaffolded.

When scaffolding begins, the PRD specifies two projects side by side:
- `web/` — Next.js (App Router) + TypeScript. Contains **both** the web frontend and the serverless backend (`src/app/api/`).
- `mobile/` — Flutter + Bloc (student view, teacher attendance marker).

Update this file with the real commands (dev server, Prisma migrate, test runner, single-test invocation) once those projects exist.

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
