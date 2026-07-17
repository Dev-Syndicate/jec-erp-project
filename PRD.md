# College ERP — Product Requirements Document (PRD)

## Context

We are building a **College ERP system** delivered across a **Next.js web app** and **Flutter mobile apps** (student view + teacher attendance marker). The first release covers **Attendance, configurable RBAC, and the academic org structure** (departments → classes → sections), plus **timetable** management.

The driving constraint throughout planning has been **cost**: keep the system at or near **₹0 to start** while remaining **secure** and **commercial-use compliant**. This PRD records the final architecture reached after evaluating (and rejecting) several shortcuts — most importantly, connecting Flutter directly to the database, which is a critical security hole.

**Intended outcome:** a secure, low-cost, relational ERP where identity is handled by Firebase, authorization (RBAC) is enforced by a serverless backend, and all data lives in a Postgres database that is never exposed to client apps.

---

## Core Requirements

### Functional
1. **Org structure:** Department → Class → Section → Student hierarchy. Each department has multiple classes; each class has multiple sections (e.g. per year).
2. **RBAC (configurable):** Admins can create custom roles and assign granular permissions via a UI (not just fixed roles). Baseline roles: Super Admin, HOD, Teacher, Student.
3. **Roles & scoping rules (hierarchy):**
   - **Super Admin (institution-level)** → **total access across ALL departments.** Creates departments, creates and assigns **HODs**, creates/edits **roles and permissions**, manages every user, and can see/manage all data institution-wide. Sits above HODs. This is the only role with cross-department authority.
   - **HOD** → full control over **their own department's** data only (classes, sections, teachers, students, timetable, attendance). **No access to other departments' data.** Cannot manage roles or other departments.
   - **Teacher** → can mark attendance **only for the class/section they are assigned to teach**.
   - **Student** → read-only access to their own records.
4. **Attendance:** assigned teacher marks attendance per section/period; students and HODs view. Auditable (record who marked, when).
5. **Timetable:** create periods, assign subject + teacher to section. Drives who is allowed to mark attendance for a given period.
6. **Leave / OD (On-Duty) requests:** student submits a leave or OD request from the app → **two-step approval: class teacher approves first, then HOD**. On final approval, the affected dates/periods are **auto-marked as OD/Excused** in attendance. Every request is fully **audited** (who submitted, when, from where) and the student is **notified** on submission — together these deter and expose impersonation.
7. **Academic Year / Semester scoping (core):** an **AcademicYear/Term** entity that attendance, enrollment, timetable (and future marks/fees) all reference. A student's section is an **Enrollment per year**, so **yearly promotion** and **HOD/teacher rotation** work cleanly without duplicating accounts or tangling history. All time-bound queries are scoped to the active term.
8. **Attendance reports & defaulters:** derived reporting on top of attendance — **below-75% defaulter lists**, monthly/per-subject %, per-section summaries, with **Excel/PDF export**. (Often more valued than the marking itself.)
9. **Announcements / Notices:** college-, department-, or section-scoped notices, pushed via **FCM**; audience respects RBAC scoping (HOD posts to own dept, Super Admin college-wide).
10. **Clients:** Next.js web (admin/HOD/teacher/student dashboards) + Flutter mobile (student view + teacher attendance marker + leave/OD + notices).

### Cross-cutting concerns (designed in from the start)
- **Academic-year scoping** on all time-bound data (above) — the single most important structural decision.
- **Audit logging** — an `AuditLog` records who changed attendance/leave/roles/announcements, when, and from where (extends the leave/OD audit trail across the system).
- **Soft deletes** — students/staff are marked **inactive**, never hard-deleted (audit/legal retention).
- **Data export** — Excel/PDF export is a first-class, recurring need (attendance sheets, mark lists, reports).
- **Bulk operations** — beyond student import: bulk attendance, **bulk promote-to-next-year**, bulk role/section assignment.

### Account & role model (important — role ≠ account)
- **A person = one permanent account** (their own email; the account never changes). **A role is assigned *to* a person**, and can be **revoked/reassigned** at any time.
- **HOD is a role assignment, not an account.** When the HOD rotates (e.g. yearly), the Super Admin **revokes** the HOD role from Person A and **grants** it to Person B — both keep their own accounts, no new email, no orphaned access, and the audit trail stays clean (records reference the real person who acted).
- **Onboarding (temporary password):** Super Admin provisions a staff account with **email + role + department**. The system generates a **temporary password**, emails it to the user, and **forces a password change on first login**. The admin never sets/keeps the real password.
- **Rationale:** tying login to a personal email but keeping the role *assignable* avoids the yearly-rotation problem (old holder retaining access, new holder needing a fresh account, tangled history).

### Account creation by role
- **Super Admin** — seeded once via a protected script (no higher role exists to create it).
- **HOD** — provisioned one-by-one by the Super Admin (email + temp password + department); the role is assignable/revocable (see rotation above).
- **Teacher** — created by **either the Super Admin or the HOD** (HOD scoped to their own department). Email (personal or college) + temp password, forced change on first login.
- **Student — roll-number login backed by a real email:**
  - Students **log in with roll number + password** (easy for them), but each account has a **real student email attached** (collected at admission — the college needs it for placement/results anyway). The email is the Firebase identity + the **secure password-delivery channel**.
  - **First password:** provisioned account → **temporary password (or set-password link) emailed to the student's real email** → **forced change on first login** — the *same secure flow as staff*. This avoids a guessable default (e.g. DOB), which matters because of the leave/OD approval workflow: a private-inbox password + email notification on submit makes **impersonation** much harder.
  - **Fallback for students without an email on file:** self-activation — student proves identity with roll number + DOB + admission number, then sets their own password.
  - **Created via bulk CSV/Excel import** by the HOD (own department) or Super Admin: upload rows (name, roll number, email, DOB, class, section, …) → backend bulk-creates the Firebase Auth user + Neon `User`/`Student` rows (`role = Student`, correct section). Uses **Firebase Admin SDK bulk user import**.
  - **Plus manual add** — a form to add individual students for late admissions or corrections.

### Non-functional
- **Scale:** 1 college, **< 5,000 users**, predictable business-hours load.
- **Cost:** near ₹0 to start; all chosen services allow **commercial use** on their free tier.
- **Security:** database credentials **never** reach client apps. All data access passes through an authorization layer.

---

## Final Tech Stack

| Layer | Choice | Cost |
|---|---|---|
| **Authentication** | **Firebase Auth** — email/password only (no phone/SMS OTP) | ₹0, unlimited users |
| **Push notifications** | **Firebase Cloud Messaging (FCM)** | ₹0, unlimited |
| **Backend** | **Next.js API routes (serverless functions)** — *default*; **AWS Lambda + API Gateway** is an accepted alternative (see note) | ₹0 |
| **Database** | **Neon Postgres** (serverless, scale-to-zero) | ₹0 free tier (see pricing) |
| **DB access** | **Prisma** ORM + Neon serverless HTTP driver | free |
| **RBAC engine** | **CASL** (abilities in code + role→permission mapping in DB) | free |
| **Image storage** | **Cloudinary** (auto-optimized, signed uploads) | ₹0 (25 credits/mo) |
| **Web frontend** | **Next.js (App Router) + TypeScript**, Tailwind + shadcn/ui + TanStack Query | ₹0 |
| **Mobile** | **Flutter + Bloc** (flutter_bloc, dio, get_it, go_router, flutter_secure_storage) | — |
| **Hosting** | **Render or Cloudflare Pages** for production (commercial-allowed free tier); **Vercel Hobby** for dev/demo only | ₹0 to start |

> **Hosting note:** Vercel's **Hobby (free) tier forbids commercial use** and has a 10s function timeout. Use it for building/demoing; run real college production on **Render / Cloudflare Pages** (commercial-allowed) or **Vercel Pro (~₹1,700/mo)**.

> **Backend option — AWS serverless (Lambda + API Gateway):** an accepted alternative to Next.js API routes if we prefer AWS-native infra. The **architecture and security boundary are identical** — Lambda runs server-side, so the Neon/Cloudinary secrets stay off the phone, and it verifies Firebase tokens + enforces RBAC exactly the same way. Trade-offs vs Next.js routes:
> - **Pairs cleanly with Neon** via the `@neondatabase/serverless` HTTP driver — **no RDS Proxy, no NAT Gateway** needed (those costs only apply to RDS, which we are not using). Lambda's **1M requests/month is always free**.
> - **Separate deploy** (SAM or Serverless Framework), more IAM/API Gateway wiring, and **cold starts** (~1s on first hit) — more moving parts than the single Next.js deploy.
> - If chosen, the backend moves out of the `web/` project into its own `api/` service (handlers per feature); Next.js becomes frontend-only and calls the Lambda API just like Flutter does. Everything else (Firebase, Neon, Prisma, CASL, Cloudinary) is unchanged.
> **Recommendation:** start on **Next.js API routes** (simplest, ₹0, one deploy for <5k users); switch to **Lambda** only if AWS-native infrastructure becomes a requirement. Decision can be deferred — clients talk to an HTTP API either way, so the frontend/mobile code is unaffected.

### Neon pricing reference (2026, confirmed from neon.com/pricing)
- **Free:** 0.5 GB storage/project (5 GB aggregate), 100 CU-hours/month, scale-to-zero, commercial use allowed, no card required.
- **Paid (Launch):** pay-as-you-go, no monthly minimum. Storage **$0.35/GB-month**, compute $0.106/CU-hour.
- **Implication:** 0.5 GB covers ~year one for a 5k-student college **if images live in Cloudinary, not the DB**. Growing later is cheap (~₹few hundred/month).

---

## Architecture

### Security boundary (non-negotiable)

```
Flutter ─┐
         ├─ Firebase Auth (email/password) ──> ID token (per-user JWT, expiring)
Next.js ─┘
                        │  send Firebase token + request
                        ▼
        Next.js API routes (serverless backend)
          ── verify Firebase token (Firebase Admin SDK)   → "who are you"
          ── enforce RBAC via CASL (dept/class scoping)    → "what can you do"
          ── hold Neon secret + Cloudinary secret SERVER-SIDE
                        │
                        ▼
                  Neon Postgres   (never exposed to clients)

Cloudinary  ← signed uploads (Flutter uploads directly; API stores only the URL in Neon)
FCM         → push notifications to Flutter + web
```

**Why the backend cannot be removed:** any secret that reaches a phone can be extracted (decompiled APK or network proxy). So Flutter must **never** hold the Neon connection string — not hardcoded, not fetched from Firebase at runtime. The serverless API is the wall between clients and the database, and the only place that enforces RBAC. Firebase tokens are safe on phones because they are per-user, expiring, and only usable against our permission-checking API.

**Separation of concerns:** Firebase = identity ("who are you"). Our API + Neon = authorization + all ERP data ("what can you do"). A `User` row in Neon links to the Firebase `uid` and holds role, department, and class assignments.

---

## Data Model (backbone)

```
AcademicYear/Term  ──referenced by──>  Enrollment, Timetable, Attendance, (future: Marks, Fees)
Department 1──∞ Class 1──∞ Section 1──∞ (Enrollment) ──∞ Student
User (firebaseUid, email, mustChangePassword) ∞──∞ Role ∞──∞ Permission   (configurable RBAC)
Student: rollNumber (unique login), name, email, dob, admissionNo, linked User, status(active/inactive)
Enrollment: student + section + academicYear     (a student's section changes per year → promotion)
TeacherAssignment: teacher → section + subject + academicYear   (gates who can mark attendance)
Timetable: section + academicYear + period + subject + teacher
Attendance: student + section + academicYear + date + status(Present/Absent/OD/Excused) + markedBy + markedAt
LeaveRequest: student + type(Leave/OD) + dates + reason + status
             + teacherApprovedBy/At + hodApprovedBy/At + submittedFrom(IP/device)   (audited)
Announcement: scope(college/department/section) + title + body + postedBy + audience
AuditLog: actor + action + entity + before/after + timestamp + source   (cross-cutting)
```

Scoping enforced in API guards/services:
- **Super Admin:** no department filter — full access to all data; sole authority to create departments, assign HODs, and manage roles/permissions.
- **HOD:** all queries filtered `WHERE departmentId = user.departmentId`
- **Teacher:** attendance limited to sections in their `TeacherAssignment`
- **Student:** read-only, own records only

**First Super Admin bootstrap:** seeded once (via a protected seed script / env-guarded endpoint), since there is no higher role to create it. All subsequent HODs and users are created by the Super Admin through the UI.

---

## Folder Structure

### Backend + Web (single Next.js project)

```
web/
├── prisma/
│   ├── schema.prisma          # AcademicYear, Department, Class, Section, Student, Enrollment,
│   │                          # User, Role, Permission, TeacherAssignment, Timetable,
│   │                          # Attendance, LeaveRequest, Announcement, AuditLog
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── api/                       # ← serverless backend lives here
│   │   │   ├── auth/route.ts          # verify Firebase token, sync User row
│   │   │   ├── departments/route.ts
│   │   │   ├── classes/route.ts
│   │   │   ├── sections/route.ts
│   │   │   ├── attendance/route.ts    # mark/view — teacher/dept scoped
│   │   │   ├── attendance/reports/route.ts  # defaulters (<75%), monthly %, export
│   │   │   ├── leave/route.ts          # submit leave/OD; teacher→HOD approval; auto-mark OD
│   │   │   ├── announcements/route.ts  # college/dept/section notices → FCM
│   │   │   ├── academic-years/route.ts # terms; promotion / enrollment rollover
│   │   │   ├── timetable/route.ts
│   │   │   ├── roles/route.ts         # configurable RBAC + role assign/revoke
│   │   │   ├── users/route.ts         # provision staff (email + temp password)
│   │   │   ├── students/
│   │   │   │   ├── route.ts           # manual add / list students
│   │   │   │   └── import/route.ts    # bulk CSV import → Firebase Admin bulk create
│   │   │   └── uploads/sign/route.ts  # Cloudinary signed-upload signature
│   │   ├── (auth)/login/
│   │   └── (dashboard)/
│   │       ├── admin/         # Super Admin: manage departments, HODs, users, roles (all depts)
│   │       ├── departments/  attendance/  timetable/  roles/  students/
│   │       └── layout.tsx
│   ├── lib/
│   │   ├── db.ts              # Prisma client (Neon serverless driver)
│   │   ├── firebase-admin.ts  # token verification (server-side)
│   │   ├── rbac/             # CASL ability factory + permission checks
│   │   └── cloudinary.ts     # signed-upload helper (secret server-side)
│   ├── components/ui/         # shadcn/ui
│   ├── features/            # per-feature UI + hooks (attendance/, departments/, ...)
│   └── types/               # shared DTOs
```

Each API route: verify Firebase token → build CASL ability from the user's role → check permission + apply dept/class scoping → Prisma query.

### Mobile (Flutter, feature-first + Bloc)

```
mobile/lib/
├── core/
│   ├── network/               # Dio + interceptor (attaches Firebase ID token)
│   ├── firebase/              # Firebase Auth + FCM setup
│   ├── storage/               # flutter_secure_storage (token cache)
│   ├── router/                # go_router
│   └── theme/
├── features/
│   ├── auth/
│   │   ├── data/  domain/
│   │   └── presentation/{bloc/ , pages/}   # auth_bloc + event + state
│   ├── attendance/presentation/bloc/       # teacher marks / student views
│   ├── leave/presentation/bloc/            # student submits leave/OD; approver views
│   ├── timetable/
│   └── profile/
└── shared/widgets/
```

---

## Build Phases

1. **Foundation:** Prisma schema (full data model, **incl. AcademicYear/Term + Enrollment + AuditLog + soft-delete flags**) + Neon connection + Firebase project (Auth email/password + FCM).
2. **Auth flow:** Firebase login (web + Flutter) → API `/api/auth` verifies token, creates/syncs `User` row with role + department. Staff provisioned via Admin SDK with a **temporary password + `mustChangePassword` flag**; first login forces a password reset before granting access.
3. **RBAC core + Super Admin:** CASL ability factory, `Role`/`Permission` tables, seed the first Super Admin, roles management UI (configurable).
4. **Admin console:** Super Admin creates departments + **academic years/terms**; provisions staff accounts (email + temp password, forced change on first login); **assigns/revokes/reassigns roles** (e.g. HOD rotation) across all departments.
5. **Org structure + users:** Department/Class/Section CRUD with HOD dept-scoping; teacher provisioning (Super Admin or HOD); **student bulk CSV import** (roll-number login + real email) + manual add; **Enrollment per academic year**.
6. **Timetable + TeacherAssignment:** assign subject + teacher to section/period (scoped to academic year).
7. **Attendance:** teacher marks (gated by assignment), student + HOD views, audit fields, academic-year scoping.
8. **Leave / OD:** student submits → **class teacher approves → HOD approves** → auto-mark attendance as OD/Excused; full audit + notification to student on submit.
9. **Reports & defaulters:** below-75% lists, monthly/per-subject %, section summaries, **Excel/PDF export**.
10. **Announcements:** college/dept/section notices (RBAC-scoped audience) pushed via FCM.
11. **Media:** Cloudinary signed uploads for profile photos (URL stored in Neon).
12. **Notifications:** FCM push for attendance alerts / leave-OD status / announcements.
13. **Audit + bulk ops:** `AuditLog` wiring across sensitive actions; **bulk promote-to-next-year** and bulk assignment tools.
14. **Clients:** Flutter student view + teacher marker + leave/OD + notices; Next.js dashboards per role.

---

## Verification

- **Security boundary:** confirm no Neon/Cloudinary secret appears in the Flutter build or any client network response; only Firebase tokens are sent from clients. Proxy the app and inspect traffic.
- **RBAC scoping (critical):** as a Teacher, attempt to mark attendance for a **non-assigned** section → must be denied. As an HOD, attempt to read **another department's** data → must be denied. As a Student, attempt to edit attendance → denied.
- **Super Admin:** the seeded Super Admin can create a department, create + assign an HOD to it, create a custom role, and view data across **all** departments. A non-admin attempting any of these → denied.
- **Staff onboarding:** provision an HOD/teacher (email + temp password) → user receives temp password → first login **forces a password change** before any access is granted. Confirm an HOD can create a teacher only within their own department.
- **Student bulk import:** upload a CSV of students to a section → accounts created with **roll-number login + real email**; a temp password/set-link is emailed, student logs in with roll number, forced change on first login. Fallback self-activation works for students with no email on file. Manual single-student add also works.
- **Leave / OD flow:** student submits a leave/OD request → **class teacher approves → HOD approves** → on final approval, attendance for the affected dates auto-marks **OD/Excused**. A request rejected at either step does not affect attendance. Student is notified on submission; the request records `submittedBy` + timestamp + source for audit (impersonation deterrence).
- **Role rotation (critical):** reassign the HOD role from Person A to Person B. Person A **immediately loses** HOD/department access (but keeps their account); Person B **gains** it. Historical records still correctly attribute past actions to Person A.
- **Academic-year scoping & promotion:** create a new academic year → **bulk-promote** a section's students → their new-year enrollment points to the next section; **prior-year attendance/timetable remain intact and queryable** under the old year.
- **Reports:** generate a defaulter (<75%) list and monthly % for a section; export to Excel/PDF successfully.
- **Announcements:** an HOD posts a notice → only their department's users receive it (FCM + in-app); a Super Admin notice reaches college-wide.
- **Auth:** register + login via email/password on both web and Flutter; verify API creates the matching `User` row and assigns role/department.
- **Attendance flow end-to-end:** teacher marks → record shows correct `markedBy` + `markedAt` → student sees it → HOD sees department aggregate.
- **Cost sanity:** confirm Neon stays under 0.5 GB (no images in DB), Cloudinary under free credits, hosting on a commercial-allowed free tier.

---

## Future Roadmap (not in Phase 1 — architecture accommodates them)

Documented so the schema and RBAC don't box us in later. All of these hang off the existing core (users, org structure, academic-year scoping, RBAC, Cloudinary/FCM):

- **Marks / Exams / Grades** — assessments, exam marks, GPA/CGPA (term-scoped, like attendance). Usually the #2 request after attendance.
- **Fees management** — fee structure, due dates, payment tracking, receipts; online payments (Razorpay/Stripe) later.
- **Assignments / Study materials** — teachers upload materials; students submit (files → Cloudinary/R2).
- **Parent access** — parents view attendance/marks/fees (a scoped, read-only role — fits the configurable RBAC).
- **Academic calendar** — holidays/exam dates/events; feeds attendance (no marking on holidays) and timetable.
- **Dashboards & analytics** — HOD dept trends, college-wide KPIs for admin.
- **Timetable conflict detection** — prevent double-booking a teacher/room.
- **Placement cell** — ties to the real student emails already collected.
- **Later:** library, hostel/transport, feedback/surveys, bonafide/ID-card generation, alumni.

> These are intentionally deferred. The Phase-1 design (term scoping, RBAC, audit, soft deletes) is chosen so adding them is additive, not a rewrite.

---

## Explicitly Rejected Approaches (and why)

- **Django on AWS Lambda:** frontends are Next.js + Flutter (JSON API only), so Django's admin/templates are wasted; Lambda + Django fights cold starts and DB pooling.
- **Flutter → Neon direct connection:** leaks the DB password (decompile/proxy) and makes RBAC unenforceable. Fatal.
- **Storing the Neon string in Firebase for Flutter to fetch:** same leak, arguably worse (interceptable over the network). Any secret that reaches a phone is public.
- **DynamoDB:** ERP is relational and reporting-heavy; NoSQL forces query patterns up front and can't do ad-hoc joins/aggregations cleanly.
- **RDS + Lambda:** needs RDS Proxy + NAT Gateway (~₹3,000/mo) — not ₹0. Neon's serverless HTTP driver avoids all of this. *(Note: plain **Lambda + Neon** is NOT rejected — it's an accepted backend alternative; see the Backend option note above. Only Lambda **with RDS** and Lambda **with Django** are rejected.)*
- **Vercel Hobby for production:** free tier forbids commercial use → use Render/Cloudflare for prod.
