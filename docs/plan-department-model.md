# Plan — Department as its own model, and first year under S&H

Status: **proposed**, not started. Branch `feature/dept-model`, based on `37360ee`.

Supersedes [plan-faculty-departments.md](./plan-faculty-departments.md), which made `Branch`
double as the department. That approach was built and then reverted: a department can run
programs across **several branches** (a Civil department running both B.E·CIVIL and
B.E·STRUCT), which a Branch-as-department model cannot express.

## The problem

`Program = Degree × Branch` is correct and stays. What's missing is the **organisational
unit**. Today `Program` is asked to be both the award *and* the thing that owns records and
scopes permissions. Those come apart in two real situations:

1. **Science & Humanities teaches every branch's first year.** S&H has a HOD and its own
   faculty, but it is not a discipline — nobody graduates in it, so it can never be the
   Branch half of a pairing.
2. **One department may run several programs across different branches** (Civil: B.E·CIVIL
   and B.E·STRUCT). A HOD scoped to a single `programId` can only administer one of them.

## The model

Four models, each with exactly one job:

| Model | Job | Example |
|---|---|---|
| `Degree` | the qualification | B.E |
| `Branch` | the **discipline** — a label in the award, nothing more | CSE |
| `Program` | `Degree × Branch` = **the award** | B.E · CSE |
| `Department` | **the organisational unit** — employs staff, has a HOD, owns classes | CSE Department, S&H |

```
Degree ──┐
         ├──► Program ──┐    the award
Branch ──┘      ▲       │
                │       ├──► Class      owner + award
Department ─────┘       │
   │  runs many programs┘
   │  owns many classes
   └─ employs faculty, one HOD
```

```prisma
model Department {
  id       String  @id @default(cuid())
  name     String  @unique   // "Computer Science and Engineering Department"
  code     String  @unique   // "CSE", "S&H"
  isActive Boolean @default(true)

  programs        Program[]         // the awards it runs (may span branches)
  classes         Class[]           // the groups it owns
  facultyProfiles FacultyProfile[]  // the staff it employs
}

model Program {
  // WHO RUNS THIS AWARD. Exactly one department; a department may run several.
  departmentId String
  department   Department @relation(fields: [departmentId], references: [id])
  // degreeId + branchId unchanged — still Degree x Branch.
}

model Class {
  // WHO OWNS THIS CLASS — the scoping key. S&H in year 1, the branch's
  // department from year 2. This is what makes first year invisible to a
  // branch HOD, by construction rather than by a rule.
  departmentId String
  department   Department @relation(fields: [departmentId], references: [id])

  // WHICH AWARD its students are headed for. Kept, because sections are
  // per-program: CSE-I-A and ECE-I-A are both owned by S&H in year 1 and would
  // otherwise be indistinguishable, and promotion needs it to know where they go.
  programId String
  program   Program @relation(fields: [programId], references: [id])
}

model FacultyProfile {
  // Employment. Branch employs nobody any more.
  departmentId String
  department   Department @relation(fields: [departmentId], references: [id])
}
```

`Branch` keeps only `name`, `code`, `isActive`, `programs[]` — a discipline label. It employs
nobody and owns nothing.

### Why `Class` keeps `programId`

The single most important consequence, and the thing that makes first year work:

| | Year 1 | Year 2+ |
|---|---|---|
| `Class.departmentId` (owner, **scoping**) | **S&H** | CSE Department |
| `Class.programId` (award) | B.E · CSE | B.E · CSE |

A CSE HOD's classes are the ones **their department owns**, so first-years are excluded
automatically — no rule to remember, no filter to forget. The award never changes, so the
student's destination is known from day one and promotion can read it.

### The student's department is DERIVED, never stored

A student's department is *whichever one owns their current class*: S&H in year 1, CSE after.
`Enrollment` is already a row per academic year, so this is a lookup, not a new field —
storing it would create a second source of truth that must be re-synced at every promotion,
and would drift.

### Authorization

Scoping moves from `programId` to `departmentId`:

| Question | Answered by |
|---|---|
| Which staff do I manage? | `FacultyProfile.departmentId = ctx.departmentId` |
| Which classes are mine? | `Class.departmentId = ctx.departmentId` |
| Which programs do I administer? | `Program.departmentId = ctx.departmentId` (plural — the Civil case) |
| Which students are mine? | students **enrolled in classes my department owns** |

An S&H HOD then owns exactly the first-year classes across every branch, and a branch HOD
sees year 2+ only. Both fall out of the model.

## What this does NOT change

- `Degree`, `Branch`, `Program` keep their meaning. `Program = Degree × Branch` stands.
- `Semester` as the hub; the one-active-year/semester invariant.
- `Enrollment` as a yearly sticker — it already models the year-1 → year-2 transfer.
- Two-table attendance; marking is the slot's own teacher only.
- `Subject` stays `@@unique([programId, code])` — first-year subjects are per-program copies
  (see Open question 4).

## Cost, measured

- `programId`: **4 schema FKs**, ~561 code references — but most are reads that keep working.
  The real work is the ~20 list/scope filters that must consciously pick owner vs. award.
- **0 first-year students, no first-year subjects, one empty `B.E·CSE Y1-A` class**
  (verified 2026-08-04). There is **no data migration** — this is the cheapest this change
  will ever be, and it gets materially more expensive after the next intake.
- 473 students, 473 enrolments, 230 slots, 110 attendance rows, 15 faculty must survive
  untouched. Every slice below is additive-then-backfill, so none of them need
  `--force-reset`.

## Slices

Each is independently `db push`-able and revertable.

1. **`Department` table + backfill.** Create it; one department per existing branch (CSE),
   plus S&H. Add `Program.departmentId`, `Class.departmentId`, `FacultyProfile.departmentId`
   — all nullable, backfilled from the current branch, then flipped to required. Nothing
   reads them yet.
2. **Faculty on the department axis.** `FacultyProfile.departmentId` becomes the scoping key
   for the `Faculty` subject; faculty lists and guards move off `programId`.
3. **Class + student scoping on the owner.** List filters and `authorize` resources move to
   `Class.departmentId`. **This is where first-years become invisible to branch HODs.**
4. **Cross-department promotion.** Drop "target must be the same program"; drive the target
   from the source class's `programId`, moving the student into the branch department's
   year-2 class.
5. **Cross-department teaching.** ✅ **Done.** `FacultyAttachment` (faculty × host department ×
   semester) lets S&H staff be timetabled in other departments. The rule lives in ONE place,
   `src/lib/teaching.ts`, because it was previously a bare `===` inlined in two routes and both
   were wrong the same way. See "Attachments" below.
6. **UI + importer + docs.** Class creation asks for owner + award; department picker on the
   faculty form; `schema-design.html` and `CLAUDE.md` updated.

## Decided

- **Year-1 classes are managed by BOTH the owning department's HOD and Super Admin.**
  Class creation is already a CASL `manage Class` check, so this is a scoping change, not a
  permission rewrite: the S&H HOD manages the classes S&H owns, Super Admin manages all.
- **First-year subjects stay per-program copies.** `Subject` keeps
  `@@unique([programId, code])`, so Maths-I is entered once per program (a CSE copy, an ECE
  copy). Repetitive to enter, but `Subject.programId` is load-bearing in the timetable,
  marks and attendance queries, and leaving it alone keeps this change contained. **No
  schema change to `Subject`.**

### Attachments (cross-department teaching)

Employment answers *who pays them*, not *where may they teach*. Those diverge for S&H, so
`FacultyAttachment` records the difference explicitly rather than inferring it.

- **Explicit rows, not a derived rule.** Chosen over "any active faculty may teach anywhere"
  (removes the guard entirely) and "derive it from the subject's program" (can't express
  *this one lecturer helps out this term*). Attachments are auditable and revocable.
- **Semester-bound.** `@@unique([facultyId, departmentId, semesterId])`. A loan lapses at
  rollover and must be renewed, so it can't quietly become permanent.
  ⚠️ **Consequence:** the check runs at WRITE time, so a `TimetableSlot` written under an
  attachment **survives** the lapse. The grid stays intact and those hours can still be
  marked, but the cell can't be edited until the lecturer is re-attached. `DELETE` returns
  `strandedSlots` so the UI can say this out loud. **A "these attachments lapsed" view at
  rollover is still owed** — without it admins will meet uneditable cells with no explanation.
- **Super Admin only.** Lending staff across departments is institution-level; a HOD asks.
  Deliberately not department-scoped — a scoped grant would let one HOD claim another
  department's staff without their agreement.
- **Pickers ask the server.** `GET /api/faculty?teachingIn=<departmentId>` returns employed +
  attached staff. The timetable and cover pickers must **not** re-filter on `departmentId`
  client-side: a visitor's own department never equals the host's, so that would hide exactly
  the people attachments exist to surface. (That bug already happened once when the pickers
  filtered on a `programId` the API had stopped sending.)

## Still open — do NOT block slice 1

1. **Does a branch HOD see their incoming first-years at all**, even read-only, to plan
   year-2 sections? Stated as no; worth confirming it means *nothing at all*.
2. **Who runs the year-1 → year-2 transfer?** Promotion is Super-Admin-only today; slice 4.
3. **Department ↔ Branch naming.** Both will exist and both are called "CSE". Worth a
   display convention ("CSE Department" vs the award "B.E · CSE") so the UI isn't ambiguous.
4. **Attachment rollover.** Attachments are semester-bound, so at rollover every loan lapses
   at once and the affected timetable cells become uneditable with no explanation. Needs
   either a "lapsed attachments — renew?" view or a carry-forward step in promotion.
