# Bulk Student Import — Design (for review)

> **Status:** design for review. Nothing built yet. Read it, flag anything wrong, answer the
> open questions at the bottom — then it gets implemented as approved.

## Why this exists

Colleges don't add students one-by-one — they hand over a spreadsheet of the whole intake. So the
primary way students get into the system is a **CSV/Excel upload** that provisions everyone at once.
The existing single-student form stays, but only for corrections and edge cases.

This is the PRD's "student CSV import" bulk operation, made concrete.

## The whole flow at a glance

```
Admin uploads students.csv
        │
        ▼
Parse + validate every row  ──► invalid rows reported, valid rows kept
        │
        ▼
Provision each valid student  (Firebase account + Neon User+Student)
   · generate a temp password per student
   · mustChangePassword = true (forced reset on first login)
        │
        ▼
Save an ImportBatch  (who was created, when, by whom)
        │
        ▼
Admin downloads results.csv   ← roll, email, tempPassword, status
        │
        ▼
College distributes credentials to students
```

Recovery if that file is lost → **regenerate** (see "Password recovery" below).

---

## 01 — What's in the CSV (account anchor only)

One row = one student **account**. NOT the full ~80-field admission record — that stays in the
per-student wizard (address, guardians, education, banks, documents). The CSV creates the login;
the rich data is filled in afterwards.

Columns map exactly to today's single-student provisioning form, so the same validation applies.
**Department is not a column** — it's chosen once in the upload UI and applied to every row (see
decision 7). So the sheet has 7 columns:

| Column | Required | Notes |
|---|---|---|
| `name` | ✅ | Full name (display name on the account) |
| `email` | ✅ | Real email = Firebase identity + password-delivery channel. Must be unique. |
| `rollNumber` | ✅ | College login handle. Must be unique. |
| `registerNumber` | — | Anna University ID. Unique when present; may be blank (assigned later). |
| `dateOfBirth` | ✅ | `YYYY-MM-DD` (also backs the self-activation fallback) |
| `phone` | ✅ | |
| `gender` | — | `MALE` / `FEMALE` / `OTHER` (blank allowed) |

**Department:** picked once in the UI before upload — all students in the sheet join it. Super Admin
picks any active department; a HOD is pinned to their own.

**Template download.** The upload UI offers a "Download template" button that gives an empty CSV
with exactly these headers + one example row, so the college fills a known-good shape.

**Excel note.** `.xlsx` is accepted too (colleges live in Excel). We parse both; internally it's the
same rows. (Library: a small SheetJS/`xlsx` reader server-side, or CSV-only first — see open Q.)

---

## 02 — Validation (before anything is created)

The upload is **all-or-nothing per row**, not per file: valid rows import, invalid rows are
rejected with a reason. Nothing half-creates.

Checked per row:
- required fields present
- `email` looks like an email; `dateOfBirth` parses
- `gender` (if given) is one of the enum values
- `department` code exists and is active
- **uniqueness** — `email`, `rollNumber`, `registerNumber` don't collide with existing students
  *or with another row in the same file* (in-file dupes are caught too)

Rows that fail are returned in the results file with `status = error` and a `reason`, so the admin
fixes just those and re-uploads them. Successful rows are never re-created on a re-upload (the
unique constraints reject duplicates → reported as `skipped: already exists`).

---

## 03 — Provisioning each student

Per valid row, the **exact same path** the single-student form already uses
(`src/app/api/users/route.ts` + `src/lib/provisioning.ts` + `src/lib/firebase-admin.ts`):

1. `generateTempPassword()` — a fresh 14-char one-time password
2. `createFirebaseUser({ email, password, displayName })` — the Firebase identity
3. Neon `User` + `Student` rows in a transaction; `mustChangePassword = true`
4. On Neon failure → roll back the Firebase user (all-or-nothing, same as today)

Done as a **bounded-concurrency loop** (e.g. 5–10 at a time) so a 300-row sheet doesn't open 300
Firebase calls at once. Each row's outcome (created / skipped / error) is collected for the results.

**Nothing new about passwords is stored.** Firebase keeps only the hash; the plaintext exists only
in the results file we hand back, and only until the admin distributes it.

---

## 04 — The results file (password delivery)

After the run, the admin downloads **results.csv**:

| Column | Notes |
|---|---|
| `rollNumber` | |
| `name` | |
| `email` | |
| `department` | code |
| `tempPassword` | the generated one-time password — **only place it's ever revealed** |
| `status` | `created` / `skipped` / `error` |
| `reason` | why, for skipped/error rows |

The college uses this to distribute credentials. Students are forced to reset on first login.

---

## 05 — Password recovery ("what if the file is lost?")  ← the important part

Passwords are never stored, so a lost results file can't just be re-downloaded as-is. Instead we
**regenerate**, at two granularities. Both are the same underlying operation:
`adminAuth.updateUser(uid, { password: newTemp })` + re-set `mustChangePassword = true` + reveal once.
(This needs a small addition to `firebase-admin.ts`: a `resetFirebasePassword(uid)` helper — Admin
SDK `updateUser`.)

**A. Regenerate for one student** *(you specifically asked for this)*
From the student's page (wizard header / details), a **"Regenerate temporary password"** button:
- resets that one student's Firebase password to a new temp
- flips `mustChangePassword` back on
- reveals it once via the existing show-once banner (`TempPasswordBanner`)

Works for any student anytime — lost password, typo'd it, whatever. Not tied to an import.

**B. Regenerate for a whole batch**
Each import is saved as an **ImportBatch**. Re-open it → **"Regenerate passwords & re-download"**:
- regenerates temp passwords for batch members **who haven't logged in yet**
  (`mustChangePassword = true` — i.e. never used the account)
- **skips** students who already logged in (they've set their own password; we must not clobber it)
- produces a fresh results.csv

Self-limiting by design: only unused accounts are touched, so re-running is safe.

> **Guard rail:** regenerating never overwrites a password a student has already personally set.
> The `mustChangePassword` flag is the signal for "still on the temp password, safe to reset."

**Backstop (already in the PRD, independent of the above):** a student with no working password can
self-activate with **roll number + DOB + register number**. So even in the worst case nobody is
permanently locked out. (Confirmed scope for *this* doc is regenerate-per-batch as the primary
recovery; self-activation is a separate auth feature, noted here as the safety net.)

---

## 06 — New data: `ImportBatch`  **NEW**

Lets us re-open an import to regenerate. Deliberately minimal — it records *what happened*, never
passwords.

```
model ImportBatch {
  id           String   @id @default(cuid())
  createdById  String                       // the admin (User) who ran it
  createdBy    User     @relation(...)
  departmentId String?                      // if the sheet was single-dept; else null
  fileName     String?                      // original upload name, for the admin's reference
  totalRows    Int
  createdCount Int
  skippedCount Int
  errorCount   Int
  createdAt    DateTime @default(now())

  members ImportBatchMember[]
}

model ImportBatchMember {
  id        String  @id @default(cuid())
  batchId   String
  batch     ImportBatch @relation(...)
  studentId String?                         // null for error rows (no student created)
  student   Student?    @relation(...)
  rollNumber String
  status     String                         // created / skipped / error
  reason     String?
}
```

`Student` gains an optional back-relation to its batch member. No password field anywhere.
`AuditLog` (already exists) records the import + each regenerate as actions.

---

## 07 — Where it lives (feature-folder + API)

- **UI** — a "Bulk import" entry under the Students nav (sibling to List / Add):
  `src/app/(app)/admin/students/import/` → upload dropzone, template download, live results table,
  "Download results" + per-row status. Batch history list with "regenerate & re-download".
- **Feature** — extends `src/features/students/` (api / hooks / components / types).
- **API** (server = the boundary; every route re-checks role + dept scope):
  - `POST /api/students/import` — accepts the file, validates, provisions, returns results + batchId
  - `GET  /api/students/import/:batchId/results` — re-download (regenerates unused-account passwords)
  - `POST /api/students/:id/regenerate-password` — single-student regenerate

Authorization mirrors the rest: **Super Admin** (any dept) or **HOD** (own dept only — a HOD's sheet
can only create students in their department; rows for other depts are rejected).

---

## Decisions — CONFIRMED (from you)

1. **Bulk CSV/Excel is the primary path**; one-by-one form stays for corrections.
2. **Delivery = downloadable results file** (not email — email deferred to a later phase).
3. **Import scope = account anchor only**; admission record filled in the wizard after.
4. **Recovery = regenerate per batch** (primary), + **per-student regenerate** must exist too.
5. Passwords are **never stored as plaintext** — regenerate-and-reveal-once instead.
6. **CSV + Excel both** from day one (`.csv` + `.xlsx`, via the `xlsx` parser).
7. **Department is picked once per upload** in the UI (per-file), NOT a CSV column — every student in
   the sheet joins that department. So the CSV drops the `department` column: **7 columns**
   (`name`, `email`, `rollNumber`, `registerNumber`, `dateOfBirth`, `phone`, `gender`). HOD uploads
   are pinned to the HOD's own department; Super Admin chooses any.
8. **Row cap = 1000 per upload.** Larger intakes split across files.
9. **"Account in use" signal = `mustChangePassword`.** Batch regenerate resets only members where
   `mustChangePassword = true` (never logged in / still on temp password) and skips the rest, so a
   student's self-chosen password is never clobbered. Correct today; revisit only if login without a
   forced reset is ever added (would then add `lastLoginAt`).

> Doc §01 lists `department` as a per-row column — supersede that with decision 7: it's a single
> UI-level choice per upload, not a column. Updated at build time.
