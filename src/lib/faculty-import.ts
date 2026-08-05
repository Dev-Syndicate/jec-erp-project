// Bulk faculty import — parse a CSV/Excel sheet into validated rows, then
// provision each valid row into a chosen department. Mirrors
// src/lib/student-import.ts deliberately: same 2-phase shape (parse → provision),
// same per-row outcome type, same reject-and-report rule, so the two importers
// stay recognisable as the same thing.
//
// WHAT DIFFERS FROM STUDENTS:
//   - staffId is the unique college handle (students use registerNumber), but
//     faculty LOG IN WITH EMAIL — so staffId is an identifier, not a credential.
//   - designation (HR title) is required; there is no roll number.
//   - The anchor is a DEPARTMENT, not a program + class: staff carry no award and
//     no enrollment, so there is nothing to enroll them into.
//
// server-only: this runs Firebase Admin + Neon writes. The department is chosen
// once in the UI (not a column); every row joins it. Passwords are generated per
// account and returned in the results — never stored.
import "server-only";

import * as XLSX from "xlsx";

import { provisionFacultyAccount } from "@/lib/provisioning";

export const MAX_IMPORT_ROWS = 1000;

// The sheet columns. Department + roles are chosen once in the UI, not per row —
// letting a spreadsheet name its own roles would be a privilege-escalation path
// straight past the role-subset rule the single-add route enforces.
export const IMPORT_COLUMNS = [
  "name",
  "email",
  "staffId",
  "designation",
  "phone",
  "gender",
  "dateOfBirth",
] as const;

type Column = (typeof IMPORT_COLUMNS)[number];

const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  fullname: "name",
  email: "email",
  staffid: "staffId",
  staffno: "staffId",
  staff: "staffId",
  employeeid: "staffId",
  empid: "staffId",
  designation: "designation",
  title: "designation",
  phone: "phone",
  mobile: "phone",
  gender: "gender",
  dateofbirth: "dateOfBirth",
  dob: "dateOfBirth",
};

export type ParsedRow = {
  rowNumber: number; // 1-based, matching the sheet (header is row 1)
  name: string;
  email: string;
  staffId: string;
  designation: string;
  phone: string;
  gender: "MALE" | "FEMALE" | "OTHER" | "";
  dateOfBirth: string; // normalised to yyyy-mm-dd; "" when absent (optional)
};

// staffId, not registerNumber — it's the identifier an admin recognises a failed
// row by, and the one thing on a faculty row guaranteed unique.
export type RowError = { rowNumber: number; staffId: string; reason: string };

export type ParseResult = {
  rows: ParsedRow[]; // structurally valid rows (dupes vs the DB surface at provision time)
  errors: RowError[]; // rows rejected during parse/validation
  tooManyRows: boolean;
};

const norm = (v: unknown) => (v == null ? "" : String(v).trim());
const normHeader = (h: string) => h.toLowerCase().replace(/[\s_-]/g, "");

/**
 * Normalise a cell into yyyy-mm-dd. Accepts ISO strings, dd-mm-yyyy / dd/mm/yyyy,
 * and Excel serial dates (xlsx gives us a Date when cellDates is on). Returns ""
 * if it can't be parsed.
 */
function normaliseDate(value: unknown): string {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return toIso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  const s = norm(value);
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toIso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return toIso(+m[3], +m[2], +m[1]);
  return "";
}

function toIso(y: number, mo: number, d: number): string {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(mo)}-${p(d)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliseGender(value: unknown): "MALE" | "FEMALE" | "OTHER" | "" | null {
  const s = norm(value).toUpperCase();
  if (!s) return "";
  if (s === "M" || s === "MALE") return "MALE";
  if (s === "F" || s === "FEMALE") return "FEMALE";
  if (s === "O" || s === "OTHER") return "OTHER";
  return null; // present but invalid
}

/**
 * Parse a spreadsheet buffer (.csv or .xlsx) into validated rows + row errors.
 *
 * Reject-and-report, never guess: a row missing an email or a staff id is
 * REPORTED, not repaired. Email is the login handle and staffId is unique, so
 * inventing either would hand someone another person's account.
 */
export function parseFacultySheet(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], errors: [], tooManyRows: false };

  // Array-of-arrays so we control header mapping ourselves.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
    defval: "",
  });
  if (grid.length < 2) return { rows: [], errors: [], tooManyRows: false };

  const headerRow = (grid[0] as unknown[]).map((h) => normHeader(String(h)));
  const colIndex: Partial<Record<Column, number>> = {};
  headerRow.forEach((h, i) => {
    const canonical = HEADER_ALIASES[h];
    if (canonical && !(canonical in colIndex)) {
      colIndex[canonical as Column] = i;
    }
  });

  const dataRows = grid.slice(1);
  const tooManyRows = dataRows.length > MAX_IMPORT_ROWS;
  const limited = dataRows.slice(0, MAX_IMPORT_ROWS);

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  const seenEmail = new Set<string>();
  const seenStaffId = new Set<string>();

  const cell = (r: unknown[], key: Column) => {
    const idx = colIndex[key];
    return idx == null ? "" : r[idx];
  };

  limited.forEach((r, i) => {
    const rowNumber = i + 2; // +1 for header, +1 for 1-based
    const name = norm(cell(r, "name"));
    const email = norm(cell(r, "email")).toLowerCase();
    const staffId = norm(cell(r, "staffId"));
    const designation = norm(cell(r, "designation"));
    const phone = norm(cell(r, "phone"));
    const gender = normaliseGender(cell(r, "gender"));
    const dateOfBirth = normaliseDate(cell(r, "dateOfBirth"));

    // Skip fully-blank rows silently (trailing rows in a saved spreadsheet).
    if (!name && !email && !staffId && !phone) return;

    const fail = (reason: string) => errors.push({ rowNumber, staffId, reason });

    if (!name) return fail("Name is required.");
    if (!email) return fail("Email is required.");
    if (!EMAIL_RE.test(email)) return fail(`Invalid email: ${email}`);
    if (!staffId) return fail("Staff ID is required.");
    if (!designation) return fail("Designation is required.");
    if (!phone) return fail("Phone is required.");
    if (gender === null) return fail("Gender must be MALE, FEMALE or OTHER (or blank).");
    // Date of birth is OPTIONAL for staff (unlike students, where it's required),
    // but a value that IS present and unparseable is an error rather than a
    // silent drop — losing it quietly would look like the sheet had no DOB.
    if (norm(cell(r, "dateOfBirth")) !== "" && !dateOfBirth) {
      return fail("Date of birth is unrecognised (use YYYY-MM-DD).");
    }

    // In-file duplicate detection — cheaper and clearer than letting the second
    // row fail at provision time with a Firebase collision.
    if (seenEmail.has(email)) return fail(`Duplicate email in file: ${email}`);
    if (seenStaffId.has(staffId)) return fail(`Duplicate staff ID in file: ${staffId}`);
    seenEmail.add(email);
    seenStaffId.add(staffId);

    rows.push({ rowNumber, name, email, staffId, designation, phone, gender, dateOfBirth });
  });

  return { rows, errors, tooManyRows };
}

export type ImportOutcome = {
  rowNumber: number;
  staffId: string;
  name: string;
  email: string;
  status: "created" | "skipped" | "error";
  reason?: string;
  facultyProfileId?: string;
  tempPassword?: string; // only for created rows — shown once, never stored
};

/**
 * Provision each parsed row into the given department, one at a time with the
 * shared helper. A row that collides with an existing account (email or staff id
 * already taken) is reported as "skipped: already exists" rather than aborting
 * the whole import — one bad row must not cost the other 40.
 *
 * Sequential on purpose, like the student importer: each row is a Firebase write
 * plus a Neon transaction, and provisionFacultyAccount rolls back the Firebase
 * identity if the DB write fails. Running these in parallel would multiply the
 * partial-failure surface for no meaningful gain at import sizes.
 */
export async function provisionRows(
  rows: ParsedRow[],
  opts: { departmentId: string; roleIds: string[] },
): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = [];

  for (const row of rows) {
    try {
      const { facultyProfileId, tempPassword } = await provisionFacultyAccount({
        email: row.email,
        displayName: row.name,
        departmentId: opts.departmentId,
        roleIds: opts.roleIds,
        staffId: row.staffId,
        designation: row.designation,
        phone: row.phone,
        gender: row.gender || null,
        dateOfBirth: row.dateOfBirth || null,
      });
      outcomes.push({
        rowNumber: row.rowNumber,
        staffId: row.staffId,
        name: row.name,
        email: row.email,
        status: "created",
        facultyProfileId,
        tempPassword,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create.";
      const isDupe = /unique|constraint|already exists|email-already/i.test(msg);
      outcomes.push({
        rowNumber: row.rowNumber,
        staffId: row.staffId,
        name: row.name,
        email: row.email,
        status: isDupe ? "skipped" : "error",
        reason: isDupe ? "Account already exists (email or staff ID in use)." : msg,
      });
    }
  }

  return outcomes;
}
