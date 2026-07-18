# Faculty Profile — Data Model Design (for review)

> **Status:** design for review. Nothing built yet. Read it, flag anything wrong, trim the fields
> you don't want, answer the open questions at the bottom — then schema + UI get built as approved.
> Mirrors the approach we used for `docs/student-admission-schema.md`.

## Scope of THIS build

Only the **Profile tab** from the reference screenshot: **Faculty Details** + **Personal Details**.

The other tabs in the screenshot — Payroll Report, Payroll Details, Leave, Experience, Bank Info,
Notes, Documents — are **deferred** to their own phases (payroll and leave especially are large
standalone features). The schema below is designed so those hang off the same `FacultyProfile`
additively later, exactly like the student admission tables hang off `Student`.

## The big picture

Staff (HOD / Teacher) are `User` rows today with only the anchor: email, displayName, role,
department. Their rich profile — the fields in the screenshot — doesn't belong bloating `User` (which
is identity + auth), so it goes on a new **`FacultyProfile`** table, 1:1 with `User`, exactly like
`StudentProfile` is 1:1 with `Student`.

```
User (exists: email, displayName, role, department — the account anchor)
  └─1:1─ FacultyProfile   — all the Profile-tab fields (this build)

  (later, additively:)
  ├─ FacultyExperience[]   — prior work history       (Experience tab)
  ├─ FacultyBank           — salary account            (Bank Info tab)
  ├─ FacultyDocument[]     — uploaded files            (Documents tab)
  ├─ Payroll…              — salary structure/payslips  (Payroll tabs)
  └─ (Leave uses the shared LeaveRequest flow)
```

Addresses reuse the existing geo lookups (`Country → State → District`) the student wizard already
uses. Rather than a staff-specific address table, see open question 1 on whether to generalise
`StudentAddress` or add a parallel `FacultyAddress`.

Legend: `*` = required · **NEW** = table doesn't exist yet.

---

## FacultyProfile  **NEW**  ·  1:1 with User

Maps the screenshot's **Faculty Details** + **Personal Details** blocks. Fields already on `User`
(email, displayName, role, department) are reused, not duplicated. All profile fields are nullable at
the DB level (a staff account can exist before the profile is filled — same draft-friendly pattern as
students); required-ness is enforced in the form/API per field marked `*`.

### Faculty Details (from the screenshot)

| Field | Type | Notes |
|---|---|---|
| designation * | String | Free text — e.g. "Asst. Professor", "Professor". The HR title (distinct from the login *role*) |
| staffId * | String @unique | The "Staff ID: #110018" in the screenshot. Required, college-assigned, unique |

> **role** and **department** already live on the `User` account — shown on this tab but not stored
> here again. "Designation" is the HR title and is separate from the auth role (a person can be
> designated "Professor" while their login role is "Teacher" or "HOD").
>
> Dropped per review: `nationalId`, `joiningDate` (not needed now).

### Personal Details (from the screenshot)

| Field | Type | Notes |
|---|---|---|
| phone * | String | "phone: 9884682121" |
| emergencyPhone | String? | "emergency phone" |
| gender | Gender? | reuse the existing `Gender` enum (MALE/FEMALE/OTHER) |
| dateOfBirth | DateTime? | "date of birth: 15-06-1981" |
| maritalStatus | MaritalStatus? | **NEW enum** — SINGLE / MARRIED / OTHER (screenshot shows "married") |
| fatherName | String? | "father name: arumugam" |
| motherName | String? | "mother name: rathina" |

> Dropped per review: `passportNo`, `bloodGroup` (not needed now).

**NEW enum:**
```
enum MaritalStatus { SINGLE  MARRIED  OTHER }
```

---

## What the UI is (this build)

A **faculty profile page** at `/admin/faculty/[id]` — open a staff member from the faculty list to
view/edit their profile. Given the deferred tabs, it starts as a **single Profile view/edit form**
(not a multi-tab wizard yet); the tab bar can be added when Experience/Bank/Documents land.

Two edit paths, matching how students work:
- **On provisioning**, the staff form stays minimal (name, email, role, department) — the anchor only.
  After creating the account we can drop the admin into the profile to fill the rest (same
  "create → continue into the form" flow the student Add-student uses), OR leave profile editing to
  the faculty list. See open question 2.
- **From the faculty list**, click a staff row → the profile page → edit + save.

Save is a single `PUT /api/faculty/[id]/profile` (upsert the `FacultyProfile`, update any anchor
fields it also owns). Dept-scoped: Super Admin any; HOD own department only — same guard shape as the
student routes.

Feature-folder: this is the **faculty** feature (`src/features/faculty/`), currently empty. The
existing `roles` feature keeps provisioning; `faculty` owns the profile view/edit + the list.

---

## Deferred (noted so the schema doesn't box them out)

- **Experience** → `FacultyExperience[]` (institution, designation, from/to) — repeatable, like the
  student education step.
- **Bank Info** → `FacultyBank` (acct, IFSC, branch) — 1:1 or small table.
- **Documents** → `FacultyDocument[]` (Cloudinary URL + type) — same pattern as `StudentDocument`.
- **Payroll Report / Details** → a payroll feature (salary structure, payslips) — its own phase.
- **Leave** → uses the shared two-step `LeaveRequest` flow (class teacher → HOD) — its own phase.
- **Notes** → minor free-text; fold in later.

None require changing `FacultyProfile`; they attach to `User`/`FacultyProfile` additively.

---

## Decisions — CONFIRMED (from review)

1. **Address deferred** — not part of this build; add `FacultyAddress` when the other tabs land.
2. **Onboarding = auto-redirect** — after creating a staff account, drop the admin straight into the
   profile form (same "create → continue" flow as the student Add-student).
3. **staffId required** (unique). **designation = free text.**
4. **Dropped fields:** `nationalId`, `joiningDate`, `passportNo`, `bloodGroup`.

Final `FacultyProfile` fields: `designation*`, `staffId*`, `phone*`, `emergencyPhone`, `gender`,
`dateOfBirth`, `maritalStatus`, `fatherName`, `motherName`. Plus the new `MaritalStatus` enum.
