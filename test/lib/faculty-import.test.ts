// Bulk faculty import parsing (src/lib/faculty-import.ts).
//
// The governing rule (auto-memory `excel-import-rejects`): a corrupt row is
// REJECTED and reported — never guessed at. Email is the login handle and staffId
// is unique, so inventing either would hand someone another person's account.
//
// Sheets are built in-memory with the same xlsx library the app parses with; no
// fixture files, no DB.
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";

import { parseFacultySheet, MAX_IMPORT_ROWS } from "@/lib/faculty-import";

/** Build an .xlsx buffer from a header row + data rows. */
function sheet(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const HEADER = ["name", "email", "staffId", "designation", "phone", "gender", "dateOfBirth"];
const valid = (over: Partial<Record<string, string>> = {}) => [
  over.name ?? "R Kumar",
  over.email ?? "r.kumar@jeppiaarcollege.org",
  over.staffId ?? "JEC001",
  over.designation ?? "Asst. Professor",
  over.phone ?? "9876543210",
  over.gender ?? "MALE",
  over.dateOfBirth ?? "1985-03-12",
];

describe("parseFacultySheet — the happy path", () => {
  it("parses a valid row and normalises it", () => {
    const { rows, errors } = parseFacultySheet(sheet([HEADER, valid()]));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rowNumber: 2, // header is row 1
      name: "R Kumar",
      email: "r.kumar@jeppiaarcollege.org",
      staffId: "JEC001",
      designation: "Asst. Professor",
      gender: "MALE",
      dateOfBirth: "1985-03-12",
    });
  });

  it("lower-cases email and trims whitespace", () => {
    const { rows } = parseFacultySheet(
      sheet([HEADER, valid({ email: "  R.Kumar@JEPPIAAR.ORG  ", name: "  R Kumar  " })]),
    );
    expect(rows[0].email).toBe("r.kumar@jeppiaar.org");
    expect(rows[0].name).toBe("R Kumar");
  });

  it("accepts header aliases (empId, title, dob)", () => {
    const { rows, errors } = parseFacultySheet(
      sheet([
        ["Full Name", "Email", "Emp ID", "Title", "Mobile", "Gender", "DOB"],
        valid(),
      ]),
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ staffId: "JEC001", designation: "Asst. Professor" });
  });

  it("accepts dd-mm-yyyy dates", () => {
    const { rows } = parseFacultySheet(sheet([HEADER, valid({ dateOfBirth: "12/03/1985" })]));
    expect(rows[0].dateOfBirth).toBe("1985-03-12");
  });

  it("normalises single-letter gender", () => {
    const { rows } = parseFacultySheet(sheet([HEADER, valid({ gender: "f" })]));
    expect(rows[0].gender).toBe("FEMALE");
  });

  it("skips fully blank trailing rows without reporting them", () => {
    const { rows, errors } = parseFacultySheet(sheet([HEADER, valid(), ["", "", "", "", "", "", ""]]));
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});

describe("parseFacultySheet — rejects rather than guesses", () => {
  // Each of these is a field we could NOT invent without risking handing someone
  // the wrong account or a meaningless record.
  const required: Array<[string, string]> = [
    ["name", "Name is required."],
    ["email", "Email is required."],
    ["staffId", "Staff ID is required."],
    ["designation", "Designation is required."],
    ["phone", "Phone is required."],
  ];

  for (const [field, reason] of required) {
    it(`rejects a row missing ${field}`, () => {
      const { rows, errors } = parseFacultySheet(sheet([HEADER, valid({ [field]: "" })]));
      expect(rows).toEqual([]);
      expect(errors).toHaveLength(1);
      expect(errors[0].reason).toBe(reason);
    });
  }

  it("rejects a malformed email instead of trying to repair it", () => {
    const { rows, errors } = parseFacultySheet(sheet([HEADER, valid({ email: "not-an-email" })]));
    expect(rows).toEqual([]);
    expect(errors[0].reason).toContain("Invalid email");
  });

  it("rejects an invalid gender rather than defaulting it", () => {
    const { rows, errors } = parseFacultySheet(sheet([HEADER, valid({ gender: "yes" })]));
    expect(rows).toEqual([]);
    expect(errors[0].reason).toContain("MALE, FEMALE or OTHER");
  });

  // Date of birth is OPTIONAL for staff — but a present-and-unparseable value is
  // an error, not a silent drop, or the sheet would look like it had no DOB.
  it("allows a blank date of birth", () => {
    const { rows, errors } = parseFacultySheet(sheet([HEADER, valid({ dateOfBirth: "" })]));
    expect(errors).toEqual([]);
    expect(rows[0].dateOfBirth).toBe("");
  });

  it("rejects a date of birth that is present but unparseable", () => {
    const { rows, errors } = parseFacultySheet(sheet([HEADER, valid({ dateOfBirth: "last tuesday" })]));
    expect(rows).toEqual([]);
    expect(errors[0].reason).toContain("Date of birth");
  });

  it("reports the staff id on a failed row so the admin can find it", () => {
    const { errors } = parseFacultySheet(sheet([HEADER, valid({ phone: "", staffId: "JEC042" })]));
    expect(errors[0]).toMatchObject({ rowNumber: 2, staffId: "JEC042" });
  });

  it("keeps good rows when another row fails", () => {
    const { rows, errors } = parseFacultySheet(
      sheet([
        HEADER,
        valid({ staffId: "JEC001", email: "a@x.org" }),
        valid({ staffId: "JEC002", email: "" }), // bad
        valid({ staffId: "JEC003", email: "c@x.org" }),
      ]),
    );
    expect(rows.map((r) => r.staffId)).toEqual(["JEC001", "JEC003"]);
    expect(errors).toHaveLength(1);
  });
});

describe("parseFacultySheet — in-file duplicates", () => {
  // Caught here rather than at provision time: cheaper, and the message names the
  // actual problem instead of surfacing a Firebase collision.
  it("rejects a duplicate email within the file", () => {
    const { rows, errors } = parseFacultySheet(
      sheet([HEADER, valid({ staffId: "JEC001" }), valid({ staffId: "JEC002" })]),
    );
    expect(rows).toHaveLength(1);
    expect(errors[0].reason).toContain("Duplicate email in file");
  });

  it("rejects a duplicate staff ID within the file", () => {
    const { rows, errors } = parseFacultySheet(
      sheet([HEADER, valid({ email: "a@x.org" }), valid({ email: "b@x.org" })]),
    );
    expect(rows).toHaveLength(1);
    expect(errors[0].reason).toContain("Duplicate staff ID in file");
  });
});

describe("parseFacultySheet — sheet-level edges", () => {
  it("returns nothing for a header-only sheet", () => {
    const { rows, errors, tooManyRows } = parseFacultySheet(sheet([HEADER]));
    expect(rows).toEqual([]);
    expect(errors).toEqual([]);
    expect(tooManyRows).toBe(false);
  });

  it("caps at MAX_IMPORT_ROWS and flags the overflow", () => {
    const many = Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) =>
      valid({ staffId: `JEC${i}`, email: `f${i}@x.org` }),
    );
    const { rows, tooManyRows } = parseFacultySheet(sheet([HEADER, ...many]));
    expect(tooManyRows).toBe(true);
    expect(rows).toHaveLength(MAX_IMPORT_ROWS);
  });
});
