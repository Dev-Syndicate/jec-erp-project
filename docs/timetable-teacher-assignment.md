# Timetable & TeacherAssignment — Design (for review)

> **Status:** design for review. Read it, trim, answer the open questions — then it gets built as
> approved. Same review-first flow as the student/faculty docs. This is the structural block that
> **unblocks attendance** (attendance permission derives from TeacherAssignment + Timetable — a
> teacher marking a non-assigned section must be denied).

## Why this is next, and what it gates

The build order is: org structure → **timetable / TeacherAssignment → attendance → leave/OD**.
Attendance can't be built correctly until we can answer **"who may mark which section, when."** That
answer comes from:

- **TeacherAssignment** — which teacher teaches which section (which subject). *Exists already*, but
  has no subject and no UI.
- **Timetable** — which period on which day a section has a given subject/teacher. *Doesn't exist.*

Attendance marking is authorized by these, not by a role grant. So this block is the prerequisite.

## What already exists (don't rebuild)

From the schema today:
- `AcademicYear` (name, start/end, `isActive`) + `Term` — **but no UI to create/activate them, and
  nothing is seeded.** Everything time-scoped needs an active year. **This is the first gap.**
- `Department → Class → Section` — exist, with a departments UI. Classes/Sections have **no UI yet**
  (created only via seed/DB today).
- `Enrollment` (student × section × year) — exists; created by admission (implicitly the section a
  student sits in).
- `TeacherAssignment` (teacher × section × academicYear, `@@unique`) — **exists, but has NO subject**
  and no UI. Comment on it literally says "gates who may mark attendance."

New in this build: **`Subject`**, **`Timetable`**, a **subject field on TeacherAssignment**, and the
**UIs** for academic year, classes/sections, subjects, assignments, and (if in scope) the timetable
grid.

---

## The gap, in build order

### 0 — Academic year + TERM management (prerequisite)

Nothing works time-scoped without an **active** `AcademicYear` **and an active `Term`** (semester).
Since assignments/timetable are term-scoped, the **active term** is what those queries filter on.
Needs a small admin UI (Super Admin): create a year + its terms (Sem 1/2), mark exactly one year and
one term active, and roll the active term forward each semester. Low effort, unblocks everything.

### 1 — Classes & Sections UI

`Class`/`Section` exist but are DB-only. Need an HOD/Super-Admin UI to add classes (e.g. "II B.Tech")
and sections ("A", "B") under a department. Attendance/timetable target a Section.

### 2 — Subject  **NEW**  ·  curriculum-fixed, defined ONCE, reused every batch

**Key insight (confirmed):** subjects are a property of the *curriculum semester*, not of a running
term. "CSE Semester 3" = {DS, OS, …}; next year's fresh batch studies the same Sem-3 subjects. So
subjects are a **reusable catalog**, not re-created each semester.

**But the catalog is editable (confirmed):** occasionally the syllabus changes and a semester's
subject set changes (Anna University regulation revision). Handled by soft-delete, NOT full
regulation versioning: on a change, **add** the new subject and **deactivate** (never hard-delete)
the old one. Because assignments are term-scoped and reference a specific `subjectId`, old terms keep
their old subjects (history intact); new terms pick from the active catalog.

Each subject is tagged with the curriculum `semesterNumber` (1–8) it belongs to:

```
model Subject {
  id             String @id @default(cuid())
  name           String
  code           String
  departmentId   String
  department     Department @relation(...)
  semesterNumber Int          // 1..8 — the curriculum semester this subject belongs to
  isActive       Boolean @default(true)  // deactivate on syllabus revision; never hard-delete
  @@unique([departmentId, code])
}
```

"CSE Sem-3 subjects" is `Subject where departmentId=CSE, semesterNumber=3, isActive=true` — a stable
but editable catalog. A future `regulation` tag can be added if formal R2017/R2021 versioning is ever
needed; not now.

### 3 — TeacherAssignment: add subject AND re-scope to TERM (the semester)

This is the important correction. Today TeacherAssignment is scoped to **`academicYearId`** — but
**teacher↔subject↔section changes every SEMESTER, not every year.** A year-level scope can't hold a
different Sem-3 vs Sem-4 assignment. So:

- **Replace `academicYearId` with `termId`** (the semester).
- **Add `subjectId`** — a teacher teaches a specific subject to a section.

```
// was: @@unique([teacherId, sectionId, academicYearId])
subjectId String
subject   Subject @relation(...)
termId    String   // was academicYearId
term      Term @relation(...)
@@unique([teacherId, sectionId, subjectId, termId])
```

Subjects are picked from the dept catalog (curriculum-fixed); only *who teaches them this term*
changes. UI: HOD sets, for the active term, "Teacher T teaches Subject S to Section X." This is the
row the attendance guard checks.

> **Enrollment stays YEAR-scoped** (confirmed: a student keeps the same section across both semesters
> of the year). Only assignments + timetable are term-scoped.

### 4 — Timetable  **NEW**  ·  term-scoped

Which period, on which weekday, a section has a subject/teacher — for a given **term**.

```
enum Weekday { MON  TUE  WED  THU  FRI  SAT }

model Timetable {
  id        String @id @default(cuid())
  sectionId String
  section   Section @relation(...)
  termId    String                  // term-scoped, like assignments
  term      Term @relation(...)
  weekday   Weekday
  period    Int                      // 1..N (period number in the day)
  subjectId String
  subject   Subject @relation(...)
  teacherId String                   // -> User (staff)
  teacher   User @relation(...)
  @@unique([sectionId, termId, weekday, period]) // one entry per slot
}
```

UI: a per-section weekly grid (rows = periods, cols = Mon–Sat); each cell picks a subject + teacher
(constrained to that section's TeacherAssignments for the term). Heaviest piece — see open question 1.

### 5 — Semester rollover (deferred, but the shape supports it)

Because subjects are reused (not re-entered) and assignments/timetable are **term-scoped rows** (old
terms untouched = history), rolling to a new semester means: activate the next term, then create the
new term's assignments. Subjects need no re-entry. A **"clone last term's assignments"** convenience
(copy the teacher↔subject↔section rows into the new term, then edit deltas) is **deferred** — build
manual term-scoped assignment first so attendance isn't blocked; add clone if manual entry proves
tedious.

---

## How attendance will use this (why the shapes above)

When attendance is built next, its guard becomes:

- **Teacher may mark** a section's attendance **iff** they have a `TeacherAssignment` for that section
  in the active year (and, if we scope by period, a `Timetable` slot for that period). This replaces
  the coarse `requireRole("Teacher")` with a real per-resource check — the point where **CASL** earns
  its keep.
- **HOD** marks/oversees any section in their department; **Super Admin** any.

So the exact fields above (subject on assignment, teacher+subject on timetable slot) are chosen to
make that guard expressible.

---

## Feature-folder placement

- `src/features/timetable/` — timetable grid + subjects + the assignment UI (data access via
  `/api/timetable`, `/api/subjects`, `/api/teacher-assignments`).
- Academic year + classes/sections are org-structure admin — extend the existing
  `departments`/admin console area, or a small `academic` feature. See open question 3.
- Every route: authenticate → role + dept scope (HOD own dept) → active-year scope → Prisma. Same
  boundary shape as existing routes.

---

## Decisions — CONFIRMED (from review)

- **Section is year-scoped** — a student keeps the same section across both semesters. Enrollment
  unchanged (stays `academicYearId`).
- **Subjects are a reusable, editable catalog** — per department, tagged `semesterNumber` (1–8),
  reused by every batch. On a syllabus change: add new + deactivate old (soft-delete), NOT full
  regulation versioning. Term-scoped assignments preserve which subject each term actually used.
- **TeacherAssignment + Timetable are TERM-scoped** — they change every semester; re-scoped from
  `academicYearId` to `termId`, and TeacherAssignment gains `subjectId`.
- **Clone-forward deferred** — build manual term-scoped assignment first (attendance isn't blocked);
  add "clone last term's assignments" later if needed.
- **Period grid deferred** — build **TeacherAssignment-only** now (term-scoped, section/day
  granularity), which unblocks attendance. The `Timetable` model + weekly grid UI come in a later
  phase; §4 above is the design for when it lands.
- **HOD manages own department** — HOD creates classes/sections/subjects + teacher assignments within
  their own department; Super Admin owns academic years/terms and any department.
- **Nav:** a new **Academic** section under Manage — Academic Year & Terms, Classes & Sections,
  Subjects, Assignments.

## This build (assignment-only slice), in order

1. **Schema** — `Subject` (new), re-scope `TeacherAssignment` to `termId` + add `subjectId`, ensure
   `Term.isActive` usable. Push.
2. **Academic Year & Terms** — Super-Admin UI: create year + terms, activate exactly one of each.
3. **Classes & Sections** — HOD/Super-Admin UI under a department.
4. **Subjects** — editable catalog per department (semesterNumber, soft-delete).
5. **Teacher Assignments** — HOD assigns teacher × subject × section for the active term.
6. **Academic nav section** wiring.

`Timetable` (§4) and clone-forward are the deferred follow-ups.
