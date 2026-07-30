// Parsing + normalisation for the two college spreadsheets:
//   "CSE ERP Data.xlsx"        — students, one sheet per year (II / III / IV)
//   "CSE_Faculty Details.xlsx" — the CSE staff list
//
// The sheets are hand-maintained, so every field here is defensive. What the
// rest of the import needs is only the anchor set the schema actually stores
// (register number, roll, name, email, phone, dob, gender, year, section) —
// the ~80 admission columns (bank, SSC/Inter marks, guardians, …) belong to the
// deferred admission-detail slice and are intentionally NOT read.
//
// Rows that cannot produce a valid, unique account are REJECTED with a reason
// rather than guessed at: register number is the student login handle and email
// is the Firebase identity, so a duplicate or blank one has no safe default.
import { readFileSync } from "node:fs";

import XLSX from "xlsx";

// --- shared helpers --------------------------------------------------------

/** Trim, collapse inner whitespace/newlines, and drop Excel's null/"NIL" noise. */
export function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s) return "";
  // The sheets use these as "no value" in free-text columns.
  if (/^(nil|nill|null|n\/a|na|-|--)$/i.test(s)) return "";
  return s;
}

/** Title-case a SHOUTED or lowercase name, preserving initials like "K S". */
export function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) =>
      // Keep dotted initials ("m.k" -> "M.K") and single letters uppercase.
      w
        .split(".")
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
        .join("."),
    )
    .join(" ");
}

// A birth date outside this window is a corrupt cell, not a real date. The
// sheets contain both (an Excel serial of `11` -> 1900, and serials in the
// 45000s -> 2024-2026, which would make a third-year undergraduate a toddler).
// Storing those unchallenged would poison every age-derived report, so they are
// rejected and listed for the college to fix.
const DOB_MIN = Date.UTC(1990, 0, 1);
const DOB_MAX = Date.UTC(2013, 0, 1);

/**
 * Excel dates arrive several ways in these files: a serial number (most rows),
 * a dd/mm/yyyy-ish string with any of / . - : or spaces as separators, or
 * garbage. Returns a UTC Date, or null if the value is unusable or implausible.
 *
 * Day-first is assumed — these are Indian records and the unambiguous rows
 * (e.g. "24/11/2007") confirm it.
 */
export function parseDob(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;

  const inWindow = (d: Date) => {
    const t = d.getTime();
    return !Number.isNaN(t) && t >= DOB_MIN && t < DOB_MAX ? d : null;
  };

  // Excel serial (days since 1899-12-30).
  if (typeof v === "number" && Number.isFinite(v)) {
    return inWindow(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000));
  }

  const s = clean(v);
  if (!s) return null;

  // Separator-tolerant day-first parse. Covers "24/11/2007", "09.05.2008",
  // "24:11:2007", "18 / 11 / 2007", "09 09 2007", and the run-together
  // "03/092025" (dd/mmyyyy). Trailing junk ("06.06.2007MBC") is ignored — the
  // date itself is unambiguous.
  const digits = s.match(/^\D*(\d{1,2})\s*[/.\-: ]\s*(\d{1,2})\s*[/.\-: ]?\s*(\d{4})/);
  const runTogether = s.match(/^\D*(\d{1,2})\s*[/.\-: ]\s*(\d{2})(\d{4})/);
  const m = digits ?? runTogether;
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Reject roll-over (e.g. 31/02) as well as out-of-window years.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return inWindow(d);
}

/** Indian 10-digit mobile. Strips +91 / spaces / punctuation; "" if unusable. */
export function parsePhone(v: unknown): string {
  const digits = clean(v).replace(/\D/g, "");
  if (!digits) return "";
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return ten.length === 10 && /^[6-9]/.test(ten) ? ten : "";
}

export function parseGender(v: unknown): "MALE" | "FEMALE" | "OTHER" | null {
  const s = clean(v).toLowerCase();
  if (s.startsWith("m")) return "MALE";
  if (s.startsWith("f")) return "FEMALE";
  return s ? "OTHER" : null;
}

/**
 * Lowercased email; "" unless it is structurally valid.
 *
 * Two unambiguous typos are repaired rather than rejected, because the intended
 * address is certain: a comma for the dot ("gmail,com") and a bare well-known
 * provider with no TLD ("...@gmail"). Anything else — a name with no domain at
 * all, say — is left invalid so the row gets reported instead of guessed at.
 */
export function parseEmail(v: unknown): string {
  let s = clean(v).toLowerCase().replace(/\s/g, "");
  if (!s) return "";

  s = s.replace(/,/g, ".").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "");
  // "@gmail" -> "@gmail.com" (also hotmail/yahoo/outlook/rediffmail).
  s = s.replace(/@(gmail|hotmail|yahoo|outlook|rediffmail)$/, "@$1.com");

  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(s) ? s : "";
}

// --- students --------------------------------------------------------------

export type StudentRow = {
  sheet: string;
  excelRow: number; // 1-based row number in the sheet, for the reject report
  registerNumber: string;
  rollNumber: string | null;
  displayName: string;
  email: string;
  phone: string;
  dateOfBirth: Date;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  year: number; // 1..4, from the sheet name (authoritative)
  section: string; // "A" | "B" | "C"
};

export type RejectedRow = {
  sheet: string;
  excelRow: number;
  registerNumber: string;
  name: string;
  reason: string;
};

// Sheet name -> study year. The in-sheet "Year & Semester" column is unreliable
// (III-Year section B is mislabelled "III-V"), so the sheet is the source of truth.
const YEAR_BY_SHEET: Record<string, number> = {
  "II YEAR CSE": 2,
  "III YEAR CSE": 3,
  "IV YEAR CSE": 4,
};

// Column positions are stable across the three sheets (the headers differ only
// in wording, e.g. "Roll Number" vs "Roll Number/ Hall Ticket Number").
const COL = {
  yearSem: 2,
  section: 3,
  roll: 4,
  register: 5,
  firstName: 6,
  lastName: 7,
  phone: 8,
  gender: 10,
  dob: 12,
  email: 25,
} as const;

/**
 * Read every student sheet, normalise, and split into accepted rows and
 * rejected ones. Uniqueness (register number, roll, email) is enforced ACROSS
 * all sheets — the first occurrence wins and later collisions are rejected, so
 * a re-run is deterministic.
 */
export function readStudents(filePath: string): {
  students: StudentRow[];
  rejected: RejectedRow[];
} {
  const wb = XLSX.read(readFileSync(filePath), { type: "buffer" });
  const students: StudentRow[] = [];
  const rejected: RejectedRow[] = [];

  const seenRegister = new Map<string, string>(); // register -> "sheet row N"
  const seenRoll = new Map<string, string>();
  const seenEmail = new Map<string, string>();

  for (const sheetName of wb.SheetNames) {
    const year = YEAR_BY_SHEET[sheetName.toUpperCase().trim()];
    if (!year) {
      console.warn(`  ! Unrecognised sheet "${sheetName}" — skipped.`);
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true,
    });

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const excelRow = i + 1;
      if (!r || !r.some((c) => c !== null && String(c).trim() !== "")) continue; // blank row

      const registerNumber = clean(r[COL.register]);
      const first = clean(r[COL.firstName]);
      const last = clean(r[COL.lastName]);
      const name = titleCase([first, last].filter(Boolean).join(" "));
      const reject = (reason: string) =>
        rejected.push({ sheet: sheetName, excelRow, registerNumber, name, reason });

      if (!name) {
        reject("No student name.");
        continue;
      }
      // Register number is the login handle — required and unique. There is no
      // safe way to invent one.
      if (!registerNumber) {
        reject("Missing register number (it is the student login handle).");
        continue;
      }
      if (seenRegister.has(registerNumber)) {
        reject(`Duplicate register number — already used by ${seenRegister.get(registerNumber)}.`);
        continue;
      }

      // Email is the Firebase identity — required and unique.
      const email = parseEmail(r[COL.email]);
      if (!email) {
        reject(`Missing or malformed email (${clean(r[COL.email]) || "blank"}).`);
        continue;
      }
      if (seenEmail.has(email)) {
        reject(`Duplicate email ${email} — already used by ${seenEmail.get(email)}.`);
        continue;
      }

      const dateOfBirth = parseDob(r[COL.dob]);
      if (!dateOfBirth) {
        reject(`Unparseable date of birth (${clean(r[COL.dob]) || "blank"}).`);
        continue;
      }

      const section = clean(r[COL.section]).toUpperCase();
      if (!/^[A-H]$/.test(section)) {
        reject(`Unrecognised section "${clean(r[COL.section])}".`);
        continue;
      }

      // Roll number is optional but unique when present — drop a duplicate roll
      // rather than losing the whole student over it.
      let rollNumber: string | null = clean(r[COL.roll]).toUpperCase() || null;
      if (rollNumber && seenRoll.has(rollNumber)) {
        console.warn(
          `  ! ${sheetName} row ${excelRow}: roll ${rollNumber} duplicates ${seenRoll.get(rollNumber)} — importing without a roll number.`,
        );
        rollNumber = null;
      }

      seenRegister.set(registerNumber, `${sheetName} row ${excelRow}`);
      seenEmail.set(email, `${sheetName} row ${excelRow}`);
      if (rollNumber) seenRoll.set(rollNumber, `${sheetName} row ${excelRow}`);

      students.push({
        sheet: sheetName,
        excelRow,
        registerNumber,
        rollNumber,
        displayName: name,
        email,
        // Phone is required by the schema but missing/garbled on some rows;
        // "" is stored rather than dropping an otherwise valid student.
        phone: parsePhone(r[COL.phone]),
        dateOfBirth,
        gender: parseGender(r[COL.gender]),
        year,
        section,
      });
    }
  }

  return { students, rejected };
}

// --- faculty ---------------------------------------------------------------

export type FacultyRow = {
  excelRow: number;
  displayName: string;
  designation: string;
  phone: string;
  email: string;
  staffId: string;
};

/**
 * Read the staff sheet. Its layout is a human-formatted report — a title block,
 * then a header row, then the list — so the header row is located by content
 * ("S No" / "Faculty Name") instead of a fixed offset.
 */
export function readFaculty(filePath: string): {
  faculty: FacultyRow[];
  rejected: RejectedRow[];
} {
  const wb = XLSX.read(readFileSync(filePath), { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true,
  });

  const headerIdx = rows.findIndex(
    (r) => r && r.some((c) => clean(c).toLowerCase() === "faculty name"),
  );
  if (headerIdx === -1) throw new Error(`Could not find the "Faculty Name" header in ${filePath}.`);

  const header = rows[headerIdx];
  const col = (label: string) =>
    header.findIndex((c) => clean(c).toLowerCase().startsWith(label.toLowerCase()));
  const iName = col("faculty name");
  const iDesig = col("designation");
  const iPhone = col("phone");
  const iMail = col("mail");

  const faculty: FacultyRow[] = [];
  const rejected: RejectedRow[] = [];
  const seenEmail = new Set<string>();
  let seq = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const excelRow = i + 1;
    if (!r) continue;

    const displayName = titleCase(clean(r[iName]));
    // Trailing footer rows ("HEAD OF THE DEPARTMENT") have a name-ish cell but
    // no email — the email check below filters them out.
    if (!displayName) continue;

    const email = parseEmail(r[iMail]);
    const reject = (reason: string) =>
      rejected.push({ sheet: sheetName, excelRow, registerNumber: "", name: displayName, reason });

    if (!email) continue; // footer / decorative row, not a staff record
    if (seenEmail.has(email)) {
      reject(`Duplicate email ${email}.`);
      continue;
    }
    seenEmail.add(email);
    seq += 1;

    faculty.push({
      excelRow,
      displayName,
      designation: clean(r[iDesig]) || "Assistant Professor",
      phone: parsePhone(r[iPhone]),
      email,
      // The sheet has no staff id column; mint a stable, readable one from the
      // department + list position so it is reproducible across re-runs.
      staffId: `CSE${String(seq).padStart(3, "0")}`,
    });
  }

  return { faculty, rejected };
}
