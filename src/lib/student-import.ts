// Bulk student import — parse a CSV/Excel sheet into validated rows, then
// provision each valid row into a chosen department. See docs/bulk-student-import.md.
//
// server-only: this runs Firebase Admin + Neon writes. The department is chosen
// once in the UI (not a column); every row joins it. Passwords are generated per
// student and returned in the results — never stored.
import "server-only";

import * as XLSX from "xlsx";

import { provisionStudentAccount } from "@/lib/provisioning";

export const MAX_IMPORT_ROWS = 1000;

// The 7 sheet columns (department is chosen in the UI, not here). registerNumber
// is the required login handle and leads; rollNumber is optional. Header names
// are matched case-insensitively and trimmed; a few common aliases are accepted.
export const IMPORT_COLUMNS = [
  "name",
  "email",
  "registerNumber",
  "rollNumber",
  "dateOfBirth",
  "phone",
  "gender",
] as const;

const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  fullname: "name",
  email: "email",
  rollnumber: "rollNumber",
  rollno: "rollNumber",
  roll: "rollNumber",
  registernumber: "registerNumber",
  regno: "registerNumber",
  register: "registerNumber",
  dateofbirth: "dateOfBirth",
  dob: "dateOfBirth",
  phone: "phone",
  mobile: "phone",
  gender: "gender",
};

export type ParsedRow = {
  rowNumber: number; // 1-based, matching the sheet (header is row 1)
  name: string;
  email: string;
  rollNumber: string;
  registerNumber: string;
  dateOfBirth: string; // normalised to yyyy-mm-dd
  phone: string;
  gender: "MALE" | "FEMALE" | "OTHER" | "";
};

export type RowError = { rowNumber: number; registerNumber: string; reason: string };

export type ParseResult = {
  rows: ParsedRow[]; // structurally valid rows (still checked for dupes at provision time)
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
  // yyyy-mm-dd already
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toIso(+m[1], +m[2], +m[3]);
  // dd-mm-yyyy or dd/mm/yyyy
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
 * Structural validation only — cross-row and DB-uniqueness are handled here for
 * in-file dupes; existing-record dupes surface at provision time.
 */
export function parseStudentSheet(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], errors: [], tooManyRows: false };

  // Array-of-arrays so we control header mapping ourselves.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: false, defval: "" });
  if (grid.length < 2) return { rows: [], errors: [], tooManyRows: false };

  const headerRow = (grid[0] as unknown[]).map((h) => normHeader(String(h)));
  const colIndex: Partial<Record<(typeof IMPORT_COLUMNS)[number], number>> = {};
  headerRow.forEach((h, i) => {
    const canonical = HEADER_ALIASES[h];
    if (canonical && !(canonical in colIndex)) {
      colIndex[canonical as (typeof IMPORT_COLUMNS)[number]] = i;
    }
  });

  const dataRows = grid.slice(1);
  const tooManyRows = dataRows.length > MAX_IMPORT_ROWS;
  const limited = dataRows.slice(0, MAX_IMPORT_ROWS);

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  const seenEmail = new Set<string>();
  const seenRoll = new Set<string>();
  const seenReg = new Set<string>();

  const cell = (r: unknown[], key: (typeof IMPORT_COLUMNS)[number]) => {
    const idx = colIndex[key];
    return idx == null ? "" : r[idx];
  };

  limited.forEach((r, i) => {
    const rowNumber = i + 2; // +1 for header, +1 for 1-based
    const name = norm(cell(r, "name"));
    const email = norm(cell(r, "email")).toLowerCase();
    const rollNumber = norm(cell(r, "rollNumber"));
    const registerNumber = norm(cell(r, "registerNumber"));
    const dateOfBirth = normaliseDate(cell(r, "dateOfBirth"));
    const phone = norm(cell(r, "phone"));
    const gender = normaliseGender(cell(r, "gender"));

    // Skip fully-blank rows silently.
    if (!name && !email && !registerNumber && !phone) return;

    const fail = (reason: string) => errors.push({ rowNumber, registerNumber, reason });

    if (!name) return fail("Name is required.");
    if (!email) return fail("Email is required.");
    if (!EMAIL_RE.test(email)) return fail(`Invalid email: ${email}`);
    // Register number is the login handle — required. Roll number is optional.
    if (!registerNumber) return fail("Register number is required.");
    if (!dateOfBirth) return fail("Date of birth is missing or unrecognised (use YYYY-MM-DD).");
    if (!phone) return fail("Phone is required.");
    if (gender === null) return fail("Gender must be MALE, FEMALE or OTHER (or blank).");

    // In-file duplicate detection.
    if (seenEmail.has(email)) return fail(`Duplicate email in file: ${email}`);
    if (seenReg.has(registerNumber)) return fail(`Duplicate register number in file: ${registerNumber}`);
    if (rollNumber && seenRoll.has(rollNumber)) {
      return fail(`Duplicate roll number in file: ${rollNumber}`);
    }
    seenEmail.add(email);
    seenReg.add(registerNumber);
    if (rollNumber) seenRoll.add(rollNumber);

    rows.push({ rowNumber, name, email, rollNumber, registerNumber, dateOfBirth, phone, gender });
  });

  return { rows, errors, tooManyRows };
}

export type ImportOutcome = {
  rowNumber: number;
  registerNumber: string; // primary identifier (login handle)
  rollNumber: string; // optional; "" when absent
  name: string;
  email: string;
  status: "created" | "skipped" | "error";
  reason?: string;
  studentId?: string;
  tempPassword?: string; // only for created rows
};

/**
 * Provision each parsed row into the given program, one at a time with the
 * shared helper. A row that collides with an existing account (email/register/
 * roll already taken) is reported as "skipped: already exists" rather than
 * aborting the whole import. Returns per-row outcomes (incl. temp passwords).
 */
export async function provisionRows(
  rows: ParsedRow[],
  opts: {
    programId: string;
    roleId: string;
    // Optional: enroll every provisioned row into this class for the active
    // year, in the same transaction as the account (no "Not enrolled" limbo).
    enrollment?: { classId: string; academicYearId: string };
  },
): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = [];

  for (const row of rows) {
    try {
      const { studentId, tempPassword } = await provisionStudentAccount({
        email: row.email,
        displayName: row.name,
        programId: opts.programId,
        roleId: opts.roleId,
        registerNumber: row.registerNumber,
        rollNumber: row.rollNumber || null,
        dateOfBirth: row.dateOfBirth,
        phone: row.phone,
        gender: row.gender || null,
        enrollment: opts.enrollment,
      });
      outcomes.push({
        rowNumber: row.rowNumber,
        registerNumber: row.registerNumber,
        rollNumber: row.rollNumber,
        name: row.name,
        email: row.email,
        status: "created",
        studentId,
        tempPassword,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create.";
      const isDupe = /unique|constraint|already exists|email-already/i.test(msg);
      outcomes.push({
        rowNumber: row.rowNumber,
        registerNumber: row.registerNumber,
        rollNumber: row.rollNumber,
        name: row.name,
        email: row.email,
        status: isDupe ? "skipped" : "error",
        reason: isDupe ? "Account already exists (email/register/roll in use)." : msg,
      });
    }
  }

  return outcomes;
}
