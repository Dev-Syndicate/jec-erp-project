// Bulk student import parsing (src/lib/student-import.ts).
//
// The governing rule (auto-memory `excel-import-rejects`): a corrupt row is
// REJECTED and reported — never guessed at. Register number and email are login
// handles, so inventing one would hand a student someone else's account. These
// tests pin that rule alongside the normalisation the college's real spreadsheets
// needed.
//
// Sheets are built in-memory with the same xlsx library the app parses with; no
// fixture files, no DB.
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";

import { parseStudentSheet, MAX_IMPORT_ROWS } from "@/lib/student-import";

/** Build an .xlsx buffer from a header row + data rows. */
function sheet(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const HEADER = ["name", "email", "registerNumber", "rollNumber", "dateOfBirth", "phone", "gender"];
const valid = (over: Partial<Record<string, string>> = {}) => [
  over.name ?? "Asha Rao",
  over.email ?? "asha@jeppiaarcollege.org",
  over.registerNumber ?? "310621104001",
  over.rollNumber ?? "21CS001",
  over.dateOfBirth ?? "2004-05-17",
  over.phone ?? "9876543210",
  over.gender ?? "FEMALE",
];

describe("parseStudentSheet — the happy path", () => {
  it("parses a valid row and normalises it", () => {
    const { rows, errors } = parseStudentSheet(sheet([HEADER, valid()]));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rowNumber: 2, // header is row 1
      name: "Asha Rao",
      email: "asha@jeppiaarcollege.org",
      registerNumber: "310621104001",
      dateOfBirth: "2004-05-17",
      gender: "FEMALE",
    });
  });

  it("lower-cases email and trims whitespace", () => {
    const { rows } = parseStudentSheet(
      sheet([HEADER, valid({ email: "  ASHA@Jeppiaar.ORG  ", name: "  Asha Rao  " })]),
    );
    expect(rows[0].email).toBe("asha@jeppiaar.org");
    expect(rows[0].name).toBe("Asha Rao");
  });

  it("numbers rows against the sheet, so errors point at the right line", () => {
    const { rows } = parseStudentSheet(
      sheet([
        HEADER,
        valid({ email: "a@x.com", registerNumber: "R1", rollNumber: "A1" }),
        valid({ email: "b@x.com", registerNumber: "R2", rollNumber: "A2" }),
      ]),
    );
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it("skips fully blank rows silently rather than reporting them", () => {
    const { rows, errors } = parseStudentSheet(sheet([HEADER, ["", "", "", "", "", "", ""], valid()]));
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("returns empty for a sheet with only a header", () => {
    expect(parseStudentSheet(sheet([HEADER]))).toEqual({ rows: [], errors: [], tooManyRows: false });
  });
});

describe("header aliases", () => {
  it("accepts the documented aliases (regno, dob, mobile, fullname, roll)", () => {
    const aliased = ["fullname", "email", "regno", "roll", "dob", "mobile", "gender"];
    const { rows, errors } = parseStudentSheet(sheet([aliased, valid()]));
    expect(errors).toEqual([]);
    expect(rows[0].registerNumber).toBe("310621104001");
    expect(rows[0].dateOfBirth).toBe("2004-05-17");
    expect(rows[0].phone).toBe("9876543210");
  });

  it("matches headers case-insensitively and ignores spaces/underscores/dashes", () => {
    const messy = ["Name", "E-mail".replace("-", ""), "Register_Number", "Roll No", "Date Of Birth", "Phone", "Gender"];
    const { rows, errors } = parseStudentSheet(sheet([messy, valid()]));
    expect(errors).toEqual([]);
    expect(rows[0].registerNumber).toBe("310621104001");
  });
});

describe("date normalisation", () => {
  it.each([
    ["2004-05-17", "2004-05-17"],
    ["17-05-2004", "2004-05-17"],
    ["17/05/2004", "2004-05-17"],
    ["2004-5-7", "2004-05-07"], // single-digit month/day get padded
  ])("normalises %s → %s", (input, expected) => {
    const { rows } = parseStudentSheet(sheet([HEADER, valid({ dateOfBirth: input })]));
    expect(rows[0]?.dateOfBirth).toBe(expected);
  });

  // Excel SERIAL dates. parseStudentSheet reads the grid with `raw: false`, so a
  // serial cell arrives as its DISPLAY string, never as a Date — which means the
  // spreadsheet's cell format decides whether the import succeeds. The two formats
  // below survive; see the `m/d/yy` case further down for the one that does not.
  const serialSheet = (numFmt: string) => {
    const ws = XLSX.utils.aoa_to_sheet([HEADER, valid()]);
    ws["E2"] = { t: "n", v: 38124, z: numFmt }; // serial 38124 = 2004-05-17
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  };

  it.each(["yyyy-mm-dd", "dd-mm-yyyy"])(
    "parses an Excel serial date formatted as %s",
    (numFmt) => {
      const { rows } = parseStudentSheet(serialSheet(numFmt));
      expect(rows[0]?.dateOfBirth).toBe("2004-05-17");
    },
  );

  it("REJECTS a serial date displayed as m/d/yy — a known import limitation", () => {
    // Documents real behaviour, not desired behaviour. `raw: false` hands the
    // parser "5/17/04", which matches none of normaliseDate's patterns (the
    // 4-digit-year requirement), so the row is rejected rather than mis-read as
    // 17 May vs 5 Nov. Rejecting beats guessing on a date of birth — but it does
    // mean an admin must reformat the DOB column before importing.
    const { rows, errors } = parseStudentSheet(serialSheet("m/d/yy"));
    expect(rows).toHaveLength(0);
    expect(errors[0].reason).toMatch(/date of birth/i);
  });

  it("REJECTS an unparseable date rather than guessing one", () => {
    const { rows, errors } = parseStudentSheet(sheet([HEADER, valid({ dateOfBirth: "not a date" })]));
    expect(rows).toHaveLength(0);
    expect(errors[0].reason).toMatch(/date of birth/i);
  });

  it("rejects an impossible calendar date instead of rolling it over", () => {
    // 31 February would silently become 2 March under a naive Date constructor.
    const { rows, errors } = parseStudentSheet(sheet([HEADER, valid({ dateOfBirth: "31-02-2004" })]));
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it("rejects an out-of-range month", () => {
    const { rows } = parseStudentSheet(sheet([HEADER, valid({ dateOfBirth: "01-13-2004" })]));
    expect(rows).toHaveLength(0);
  });
});

describe("required fields — reject, never invent", () => {
  it.each([
    ["name", /name is required/i],
    ["email", /email is required/i],
    ["registerNumber", /register number is required/i],
    ["phone", /phone is required/i],
  ])("rejects a row missing %s", (field, pattern) => {
    const { rows, errors } = parseStudentSheet(sheet([HEADER, valid({ [field]: "" })]));
    expect(rows).toHaveLength(0);
    expect(errors[0].reason).toMatch(pattern);
  });

  it("rejects a malformed email", () => {
    const { rows, errors } = parseStudentSheet(sheet([HEADER, valid({ email: "not-an-email" })]));
    expect(rows).toHaveLength(0);
    expect(errors[0].reason).toMatch(/invalid email/i);
  });

  it("treats roll number as OPTIONAL — register number is the login handle", () => {
    const { rows, errors } = parseStudentSheet(sheet([HEADER, valid({ rollNumber: "" })]));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].rollNumber).toBe("");
  });

  it("reports the register number alongside the error, so a human can find the row", () => {
    const { errors } = parseStudentSheet(sheet([HEADER, valid({ phone: "", registerNumber: "R99" })]));
    expect(errors[0]).toMatchObject({ rowNumber: 2, registerNumber: "R99" });
  });
});

describe("gender normalisation", () => {
  it.each([
    ["M", "MALE"],
    ["male", "MALE"],
    ["F", "FEMALE"],
    ["female", "FEMALE"],
    ["O", "OTHER"],
    ["other", "OTHER"],
  ])("accepts %s → %s", (input, expected) => {
    const { rows } = parseStudentSheet(sheet([HEADER, valid({ gender: input })]));
    expect(rows[0]?.gender).toBe(expected);
  });

  it("allows a blank gender", () => {
    const { rows, errors } = parseStudentSheet(sheet([HEADER, valid({ gender: "" })]));
    expect(errors).toEqual([]);
    expect(rows[0].gender).toBe("");
  });

  it("rejects a present-but-invalid gender rather than defaulting it", () => {
    const { rows, errors } = parseStudentSheet(sheet([HEADER, valid({ gender: "X" })]));
    expect(rows).toHaveLength(0);
    expect(errors[0].reason).toMatch(/gender/i);
  });
});

describe("in-file duplicate detection", () => {
  it("rejects the SECOND row on a duplicate email, keeping the first", () => {
    const { rows, errors } = parseStudentSheet(
      sheet([
        HEADER,
        valid({ email: "same@x.com", registerNumber: "R1", rollNumber: "A1" }),
        valid({ email: "same@x.com", registerNumber: "R2", rollNumber: "A2" }),
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].registerNumber).toBe("R1");
    expect(errors[0]).toMatchObject({ rowNumber: 3, registerNumber: "R2" });
    expect(errors[0].reason).toMatch(/duplicate email/i);
  });

  it("rejects a duplicate register number — the login handle", () => {
    const { rows, errors } = parseStudentSheet(
      sheet([
        HEADER,
        valid({ email: "a@x.com", registerNumber: "SAME", rollNumber: "A1" }),
        valid({ email: "b@x.com", registerNumber: "SAME", rollNumber: "A2" }),
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(errors[0].reason).toMatch(/duplicate register number/i);
  });

  it("rejects a duplicate roll number when present", () => {
    const { rows, errors } = parseStudentSheet(
      sheet([
        HEADER,
        valid({ email: "a@x.com", registerNumber: "R1", rollNumber: "SAME" }),
        valid({ email: "b@x.com", registerNumber: "R2", rollNumber: "SAME" }),
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(errors[0].reason).toMatch(/duplicate roll number/i);
  });

  it("does NOT treat repeated blank roll numbers as duplicates", () => {
    const { rows, errors } = parseStudentSheet(
      sheet([
        HEADER,
        valid({ email: "a@x.com", registerNumber: "R1", rollNumber: "" }),
        valid({ email: "b@x.com", registerNumber: "R2", rollNumber: "" }),
      ]),
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it("compares emails case-insensitively (they are lower-cased first)", () => {
    const { rows, errors } = parseStudentSheet(
      sheet([
        HEADER,
        valid({ email: "Dup@x.com", registerNumber: "R1", rollNumber: "A1" }),
        valid({ email: "dup@X.COM", registerNumber: "R2", rollNumber: "A2" }),
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(errors[0].reason).toMatch(/duplicate email/i);
  });
});

describe("row cap", () => {
  it("flags tooManyRows and truncates beyond the cap", () => {
    const many = Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) =>
      valid({ email: `s${i}@x.com`, registerNumber: `R${i}`, rollNumber: `A${i}` }),
    );
    const { rows, tooManyRows } = parseStudentSheet(sheet([HEADER, ...many]));
    expect(tooManyRows).toBe(true);
    expect(rows).toHaveLength(MAX_IMPORT_ROWS);
  });

  it("does not flag a sheet exactly at the cap", () => {
    const many = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) =>
      valid({ email: `s${i}@x.com`, registerNumber: `R${i}`, rollNumber: `A${i}` }),
    );
    const { rows, tooManyRows } = parseStudentSheet(sheet([HEADER, ...many]));
    expect(tooManyRows).toBe(false);
    expect(rows).toHaveLength(MAX_IMPORT_ROWS);
  });
});

describe("a mixed sheet — valid rows survive alongside rejects", () => {
  it("imports the good rows and reports each bad one separately", () => {
    const { rows, errors } = parseStudentSheet(
      sheet([
        HEADER,
        valid({ email: "ok1@x.com", registerNumber: "R1", rollNumber: "A1" }),
        valid({ email: "bad-email", registerNumber: "R2", rollNumber: "A2" }),
        valid({ email: "ok2@x.com", registerNumber: "R3", rollNumber: "A3" }),
        valid({ email: "ok4@x.com", registerNumber: "", rollNumber: "A4" }),
      ]),
    );
    expect(rows.map((r) => r.registerNumber)).toEqual(["R1", "R3"]);
    expect(errors.map((e) => e.rowNumber)).toEqual([3, 5]);
  });
});
