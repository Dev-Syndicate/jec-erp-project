# Degree + Branch structure (replacing free-text Department) — Design (for review)

> **Status:** design for review. Read it, trim, answer the open questions — then it gets built as
> approved. Same review-first flow as the other big features. This restructures the most
> load-bearing entity in the app (Department), so it's worth getting right before any code.

## What's changing and why

Today a **Department** is a single free-text name+code — e.g. *"B.E - Computer Science and
Engineering" / "CSE"*. But that one field secretly mashes together **two** things your reference
system keeps separate (per the Course/Branch dropdowns):

- **Course = Degree**: Bachelor of Engineering, B.Tech, M.E., M.Tech, MBA, MCA…
- **Branch**: CSE, ECE, IT, AIML, MECH, VLSI…

A student is admitted into **Degree · Branch · Year · Section** (e.g. *B.E · CSE · II · A*). So we
split the mashed-together department into two **admin-configurable lists** (Degree, Branch) and build
the unit from them.

## The model

Three ideas, chosen to change as little of the working scoping layer as possible:

```
Degree   (configurable list)  ─┐
                               ├──► Department = one Degree × one Branch pairing
Branch   (configurable list)  ─┘        e.g. (B.E) × (CSE) = "B.E - CSE"
                                             │
                                     Class (Year 1..N)  ← N from the Degree's duration
                                             │
                                     Section (A, B, C…)
```

### Degree  **NEW** · admin-configurable

```
model Degree {
  id           String @id @default(cuid())
  name         String @unique  // "Bachelor of Engineering"
  code         String @unique  // "B.E"
  durationYears Int            // 4 for B.E/B.Tech, 2 for M.E/M.Tech/MBA, etc.
  isActive     Boolean @default(true)
}
```
Duration lives here — it's what makes the **Year** dropdown adapt (B.E → I–IV, M.E → I–II).

### Branch  **NEW** · admin-configurable

```
model Branch {
  id       String @id @default(cuid())
  name     String @unique  // "Computer Science and Engineering"
  code     String @unique  // "CSE"
  isActive Boolean @default(true)
}
```

### Department = a Degree × Branch pairing  (KEEP the entity, redefine its identity)

**We keep the `Department` table and `departmentId` everywhere** — auth/RBAC scoping, students,
faculty, classes, subjects, assignments, imports all stay keyed on it unchanged. We only change *how a
Department is defined*: instead of typing a name, the admin **picks a Degree + a Branch**. The
name/code become derived.

```
model Department {
  id       String @id @default(cuid())
  degreeId String
  degree   Degree @relation(...)
  branchId String
  branch   Branch @relation(...)
  isActive Boolean @default(true)
  // …all existing relations (classes, users, subjects, teacherAssignments, importBatches) unchanged
  @@unique([degreeId, branchId])   // one "B.E-CSE" per college
}
```
- Display name derived: `${degree.code} - ${branch.name}` → *"B.E - Computer Science and Engineering"*
  (exactly today's format), code → `${degree.code}-${branch.code}` → *"B.E-CSE"*.
- **HOD scopes to a Department = a specific Degree+Branch pairing** (confirmed: head of *B.E-CSE*,
  not all of CSE). Zero change to the scoping code — it still filters `departmentId`.

> Why keep the name "Department" internally: `departmentId` is referenced across the entire codebase
> and the whole auth-scoping layer. Renaming it to `programId` would be a huge, risky sweep for no
> functional gain. Internally it stays `Department`; in the **UI** it's presented as the Degree+Branch
> pairing (see open question 2 on the UI label).

### Class = Year  (driven by the degree's duration)

Today `Class.name` is free text ("II B.Tech"). It becomes a **Year number** picked from a dropdown
that runs `1..degree.durationYears`:

```
model Class {
  // was: name String
  year Int   // 1..N, where N = the department's degree.durationYears
  departmentId String
  …
  @@unique([departmentId, year])   // one "II" per department
}
```
Display derived: "I", "II", … or "II B.E". With Year as a real number, later we can auto-derive the
**curriculum semester** from (year + active Odd/Even term): year 2 + Odd = Sem 3.

### Section — configurable

Sections stay simple rows under a Class, but added from a **letter picker (A–Z, minus existing)**
rather than free text — so there's no hardcoded A–F limit and no typos. (If you want a global
"allowed section letters" setting instead, see open question 3.)

---

## Admin UI (all admin-configurable, per your ask)

A **Setup** area (Super Admin) with:
- **Degrees** — list + add (name, code, duration years) + activate/deactivate.
- **Branches** — list + add (name, code) + activate/deactivate.
- **Departments** — create by **picking a Degree + a Branch** (replaces free-text create); shows the
  derived "B.E - CSE". Deactivate as today.

Then, under **Academic** (already built): **Classes & sections** — pick Year (from the department's
degree duration) + add sections.

Degrees/Branches are Super-Admin-managed (institution-wide). HODs work within their department.

---

## Codebase impact (honest scope)

Because we keep `Department`/`departmentId`, the ripple is contained but real:
- **Schema**: add `Degree`, `Branch`; change `Department` (drop name/code, add degreeId/branchId);
  change `Class.name` → `year`. Push (clean DB).
- **Departments feature/API**: create now takes degreeId+branchId; list returns derived name/code.
  `DepartmentSelect` keeps working (shows derived name).
- **New**: Degrees + Branches CRUD (API + a small feature + admin pages).
- **Classes**: year dropdown from the department's degree duration; section letter picker.
- **Seed**: optionally seed a starter set of Degrees (B.E, B.Tech, M.E, M.Tech, MBA, MCA) and Branches
  (the list from your screenshot) so the admin isn't typing them all — see open question 1.
- **Everything else** (auth scoping, students, faculty, subjects, assignments, imports): **unchanged**
  — still keyed on `departmentId`.

Student admission's **Course/Branch** (from the reference screenshots) = the student's department
pairing; the admission form can show Degree + Branch selects that resolve to the department, or just
pick the department directly. (Kept out of scope here; noted for when we revisit admission.)

---

## Decisions — CONFIRMED (from review)

- **HOD scopes to the Degree+Branch pairing** (head of B.E-CSE specifically).
- **Start clean** — current test departments are re-modeled; fresh DB, no migration of old rows.
- **Degree + Branch are both admin-configurable lists.**
- **Duration lives on Degree**; the Year dropdown adapts to it.
- **Keep `Department`/`departmentId` internally** to avoid a risky codebase-wide rename.

## More decisions — CONFIRMED (from review round 2)

- **Seed just B.E for now** — one Degree: `B.E` (Bachelor of Engineering, 4 years). Other degrees
  (B.Tech/M.E/MBA/MCA) are added by the admin later when needed.
- **Seed branches** (accurate B.E set, editable): CSE, ECE, EEE, MECH, CIVIL, IT, AIDS (AI & Data
  Science), AIML (AI & Machine Learning), AERO (Aeronautical Engineering), BIO (Biotechnology).
- **UI label = "Programs"** — the nav/page for the Degree+Branch pairing is called **Programs**
  (internal code stays `Department`/`departmentId`).
- **Sections = letter picker A–H** (pick from A…H, minus already-added).
