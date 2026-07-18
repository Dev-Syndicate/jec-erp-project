# Student Admission — Data Model Design

> **Status:** design for review. Nothing is built yet. Review this, flag anything wrong,
> answer the open questions at the bottom, and the schema + migration get implemented
> exactly as approved — then the wizard UI is built step by step.

## The big picture

The current `Student` table holds a handful of fields. The admission wizard (the 5-step form:
Basic Info → Personal Info → Educational Info → Banks → Documents) needs ~80 fields that don't
all belong on one table:

- some are **single-value** (Aadhaar, religion, category) → go on a profile table
- some **repeat** (multiple schools, banks, guardians) → their own tables, many rows per student
- some are **documents** (files) → a documents table, file itself in Cloudinary
- some are **lookups** (country/state/district) → reference tables

So the plan splits them into **one core profile + several related tables**. The existing `Student`
(rollNumber, registerNumber, the login link) stays as the anchor; everything here hangs off it.

Legend: `*` = required · **NEW** = table doesn't exist yet · _lookup_ = reference data.

---

## Relationship map

```
Student  (exists: rollNumber, registerNumber, user link)
  ├─1:1─ StudentProfile   — all the single-value personal/admission fields
  ├─1:1─ StudentFee       — total + per-year fees
  ├─1:2─ StudentAddress   — present + permanent (type-tagged)
  ├─1:∞─ Guardian         — father / mother / guardian (relation-tagged)
  ├─1:∞─ EducationRecord  — school / college / entrance (level-tagged)
  ├─1:∞─ BankAccount
  └─1:∞─ StudentDocument  — uploaded files (Cloudinary URLs), type-tagged

Lookups:  Country ─1:∞─> State ─1:∞─> District   (for the address dropdowns)
```

Academic fields (Program, Batch, Course, Academic Year, Year&Semester, Section) already map to the
existing `Department → Class → Section` + `AcademicYear` + `Enrollment` structure. The wizard's
Academic step creates an `Enrollment` row — no new columns needed for it.

---

## 01 — StudentProfile  **NEW**  ·  1:1 with Student

Single-value fields from *Basic Info* + *Personal Info*. Fields already on `Student` (rollNumber,
registerNumber, dateOfBirth, phone, gender) are reused, not duplicated.
**`bloodGroup` is dropped from `Student`** (small migration).

Email note: the student's login email lives on their `User` account (Firebase identity). The
`email` below is that same required email, surfaced on the Basic Info step — it maps to
`User.email`, not a duplicate column.

| Field | Type | Notes |
|---|---|---|
| email * | → User.email | Login/identity email, entered on Basic Info |
| fullNameSSC * | String | Full name in block letters, as per SSC records |
| region | String? | e.g. Tamil Nadu |
| alternatePhone | String? | Secondary contact |
| seatTypeCategory * | SeatType (enum) | Convener / Management |
| aadhaarNumber | String? | 12-digit Aadhaar — optional for now |
| religion | → Religion? | _lookup, optional_ |
| category | → Category? | _lookup, optional_ |
| caste | → Caste? | _lookup, optional_ |
| scholarshipType | String? | First Graduate / PMSS / Others |
| accommodation * | Accommodation (enum) | Day Scholar / Hostel |

---

## 02 — StudentFee  **NEW**  ·  1:1 with Student  ·  OPTIONAL step

From *Fee Information (4 years)*. Separate table so fee edits + audit stay clean.
Optional: the fee row may not exist yet; a student can be saved without it. All fields nullable.

| Field | Type | Notes |
|---|---|---|
| totalFee | Decimal? | Total for 4 years (₹) |
| firstYearFee | Decimal? | |
| secondYearFee | Decimal? | |
| thirdYearFee | Decimal? | |
| fourthYearFee | Decimal? | |

---

## 03 — StudentAddress  **NEW**  ·  up to 2 rows per Student (present + permanent)  ·  OPTIONAL step

From *Present Address* + *Permanent Address*. One table, up to two rows, tagged by `kind`.
Country/State/District are lookups so the dropdowns cascade. Optional: a student can have no
address rows; the step can be skipped. (When an address IS added, its starred fields are required.)

| Field | Type | Notes |
|---|---|---|
| kind * | AddressKind (enum) | PRESENT / PERMANENT |
| countryId * | → Country | _lookup_ |
| stateId * | → State | _lookup_ |
| districtId * | → District | _lookup_ |
| pincode * | String | |
| type * | String | Home / Office / … (the "Type" dropdown) |
| addressLine1 * | String | |
| addressLine2 | String? | |

---

## 04 — Guardian  **NEW**  ·  up to 3 rows per Student  ·  OPTIONAL step

From *Personal Info* — Father / Mother / Guardian, same shape each. Tagged by `relation`.
**Replaces** the four flat father/mother columns added earlier to `Student`.
Optional: zero to three; the step can be skipped.

| Field | Type | Notes |
|---|---|---|
| relation * | GuardianRelation (enum) | FATHER / MOTHER / GUARDIAN |
| fullName * | String | In block letters, as per SSC |
| email | String? | |
| mobile | String? | |
| occupation | String? | |
| annualIncome | String? | Band (e.g. "Below 1 Lac") — a dropdown |
| address | String? | Guardian-only field in your form |

---

## 05 — EducationRecord  **NEW**  ·  many rows per Student  ·  OPTIONAL step

From *Educational Info* — School / College / Entrance tables, each "Add New" repeatable.
Tagged by `level`. Columns cover the superset (entrance rows leave marks/GPA null).
Optional: a student can have zero education records; the step can be skipped.

| Field | Type | Notes |
|---|---|---|
| level * | EducationLevel (enum) | SCHOOL / COLLEGE / ENTRANCE |
| instituteName * | String | School / College / Exam name |
| board | String? | |
| yearOfPassing | Int? | Graduation year for college |
| hallTicketNo | String? | |
| marks | String? | |
| percentage | Decimal? | |
| gpa | Decimal? | |
| totalMPC | Int? | College only — total Maths/Physics/Chem |
| obtainedMPC | Int? | College only |
| rank | Int? | Entrance only — Rank / CRL |

---

## 06 — BankAccount  **NEW**  ·  many rows per Student  ·  OPTIONAL step

From *Banks* — repeatable "Add New". Optional: zero or more; the step can be skipped.

| Field | Type | Notes |
|---|---|---|
| bankName * | String | |
| accountHolder * | String | |
| accountNo * | String | |
| ifscCode * | String | |
| type | String? | Savings / Current |
| branch | String? | |

---

## 07 — StudentDocument  **NEW**  ·  many rows per Student  ·  OPTIONAL step

From *Documents* — Photo, Signature, and the upload grid (Aadhaar, PAN, 10th/11th/12th, Inter, TC,
EAMCET, Rank card, Birth/Community/Income/First-Graduate certs). One row per uploaded file; the
file lives in **Cloudinary** (per the stack — never in the DB), we store the URL + type.

| Field | Type | Notes |
|---|---|---|
| docType * | DocumentType (enum) | PHOTO / SIGNATURE / AADHAAR / PAN / TENTH / … |
| url * | String | Cloudinary secure URL |
| fileName | String? | Original name |
| uploadedAt | DateTime | default now() |

Uploads accept jpg/jpeg/png/svg/pdf only. Photo target 300×300.
**File upload needs Cloudinary wired**, which isn't done yet — so Documents is the one step with a
prerequisite before it can be built.

---

## 08 — Lookups: Country · State · District  **NEW**

The address dropdowns cascade (country → its states → its districts). Reference tables, seeded once.
For India-only: ~1 country, ~36 states, ~750 districts.

```
Country (id, name, code) ─1:∞─> State (id, name, countryId) ─1:∞─> District (id, name, stateId)
```

---

## Decisions — CONFIRMED

1. **Cloudinary** — wire everything (lib + `.env` placeholders + upload flow); real credentials
   added later by the user. So Documents can be built now against the wiring; it just won't upload
   until keys are in.
2. **Country/State/District** — **India-only** seed (1 country, ~36 states, ~750 districts).
3. **Flat guardian columns** on `Student` (fatherName/fatherPhone/motherName/motherPhone) →
   **dropped**, replaced by the `Guardian` table.
4. **Category / Caste / Religion / Mother tongue** — **lookup dropdowns, all OPTIONAL** (backed by
   small lookup tables, seeded). So `category`, `caste`, `religion`, `motherTongue` become nullable
   FKs to lookup tables instead of required strings.
5. **Save-per-step** — each wizard tab saves on its own. Needs a **draft student state**: a Student
   can exist with only Basic Info filled and be completed later. Implies an `admissionStatus`
   (DRAFT → SUBMITTED) and most fields nullable until the step that owns them is saved.

### Still pending from you

- **Field deletions.** You'll tell me which fields to remove from `StudentProfile` and the other
  tables. Holding implementation until that list arrives — then schema + migration go in.

---

_Order once field list is in: implement schema + migration → wire Cloudinary + lookups seed →
build wizard UI step by step, save-per-step (Basic → Personal → Educational → Banks → Documents)._
