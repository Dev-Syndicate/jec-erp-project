// Import the college's real CSE data from the two spreadsheets.
//
// Run: pnpm exec tsx scripts/import/seed-cse.mts
//      pnpm exec tsx scripts/import/seed-cse.mts --dry-run   (parse + report only)
//
// Builds, in order:
//   1. Structure  — Degree B.E -> Branch CSE -> Program (B.E x CSE) -> Classes
//   2. Time       — AcademicYear 2025-2026 + its Odd/Even semesters (Odd active)
//   3. Faculty    — 13 staff from CSE_Faculty Details.xlsx
//   4. Students   — from CSE ERP Data.xlsx, each enrolled into their class
//
// Every account is provisioned the way the app does it (src/lib/provisioning.ts):
// the Firebase identity FIRST, then the linked Neon rows in a transaction; if
// the Neon write fails the Firebase user is deleted, so a row either lands
// completely or not at all and a re-run won't collide on the email.
//
// The script is RESUMABLE: an email that already exists in Firebase and already
// has a Neon User is skipped, so re-running after a partial failure continues
// where it stopped rather than duplicating or dying.
//
// Temp passwords are written to a CSV (gitignored) for distribution; every
// account has mustChangePassword=true and must reset on first login.
import "dotenv/config";

import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { readFaculty, readStudents, type RejectedRow } from "./xlsx-source.js";

neonConfig.webSocketConstructor = ws;

const DRY_RUN = process.argv.includes("--dry-run");

const STUDENT_FILE = "CSE ERP Data.xlsx";
const FACULTY_FILE = "CSE_Faculty Details.xlsx";
const OUT_DIR = "prisma/data";

// The academic year the spreadsheets describe. The II-year sheet's register
// numbers start 3108-25-…, i.e. the 2025 admission batch, so the students in
// these sheets are sitting in the 2025-2026 year, Odd semester.
const ACADEMIC_YEAR = { name: "2025-2026", start: "2025-06-01", end: "2026-05-31" };

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — cannot run.`);
  return v;
}

const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: requireEnv("DIRECT_URL") }) });

let adminAuth: Auth;
function auth(): Auth {
  if (!adminAuth) {
    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert({
          projectId: requireEnv("FIREBASE_ADMIN_PROJECT_ID"),
          clientEmail: requireEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
          privateKey: requireEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
        }),
      });
    adminAuth = getAuth(app);
  }
  return adminAuth;
}

// Same alphabet + shape as src/lib/provisioning.ts (that module is `server-only`
// and cannot be imported from a tsx script, so the generator is mirrored here).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generateTempPassword(length = 14): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * Get-or-create a Firebase identity for an email. Returns the uid plus the temp
 * password when one was set (null when the account already existed, in which
 * case its password is untouched — we must never silently reset a live login).
 */
async function ensureFirebaseUser(email: string, displayName: string) {
  try {
    const existing = await auth().getUserByEmail(email);
    return { uid: existing.uid, tempPassword: null as string | null };
  } catch {
    const tempPassword = generateTempPassword();
    const created = await auth().createUser({ email, password: tempPassword, displayName });
    return { uid: created.uid, tempPassword };
  }
}

/** Run `work` over `items` with bounded concurrency (Firebase is the bottleneck). */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await work(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

type Credential = { role: string; name: string; login: string; email: string; tempPassword: string };
const credentials: Credential[] = [];
const failures: RejectedRow[] = [];

// --- 1. structure + time ---------------------------------------------------

async function seedStructureAndTime(sections: Map<number, Set<string>>) {
  const degree = await db.degree.upsert({
    where: { code: "B.E" },
    update: { name: "Bachelor of Engineering", durationYears: 4, isActive: true },
    create: { name: "Bachelor of Engineering", code: "B.E", durationYears: 4, isActive: true },
  });

  const branch = await db.branch.upsert({
    where: { code: "CSE" },
    update: { name: "Computer Science and Engineering", isActive: true },
    create: { name: "Computer Science and Engineering", code: "CSE", isActive: true },
  });

  const program = await db.program.upsert({
    where: { degreeId_branchId: { degreeId: degree.id, branchId: branch.id } },
    update: { isActive: true },
    create: { degreeId: degree.id, branchId: branch.id, isActive: true },
  });

  // Classes: exactly the (year, section) pairs the spreadsheets contain.
  const classes = new Map<string, string>(); // "2-A" -> classId
  for (const [year, secs] of [...sections].sort((a, b) => a[0] - b[0])) {
    for (const section of [...secs].sort()) {
      const cls = await db.class.upsert({
        where: { programId_year_section: { programId: program.id, year, section } },
        update: { isActive: true },
        create: { programId: program.id, year, section, isActive: true },
      });
      classes.set(`${year}-${section}`, cls.id);
    }
  }
  console.log(`  Classes: ${[...classes.keys()].join(", ")}`);

  // Exactly one active AcademicYear + one active Semester (app-enforced invariant).
  await db.academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } });
  const year = await db.academicYear.upsert({
    where: { name: ACADEMIC_YEAR.name },
    update: { isActive: true },
    create: {
      name: ACADEMIC_YEAR.name,
      startDate: new Date(ACADEMIC_YEAR.start),
      endDate: new Date(ACADEMIC_YEAR.end),
      isActive: true,
    },
  });

  await db.semester.updateMany({ where: { isActive: true }, data: { isActive: false } });
  const odd = await db.semester.upsert({
    where: { academicYearId_kind: { academicYearId: year.id, kind: "ODD" } },
    update: { isActive: true },
    create: {
      academicYearId: year.id,
      kind: "ODD",
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-11-30"),
      isActive: true,
    },
  });
  await db.semester.upsert({
    where: { academicYearId_kind: { academicYearId: year.id, kind: "EVEN" } },
    update: {},
    create: {
      academicYearId: year.id,
      kind: "EVEN",
      startDate: new Date("2025-12-01"),
      endDate: new Date("2026-05-31"),
      isActive: false,
    },
  });

  console.log(`  Academic year ${year.name} (active), Odd semester active.`);
  return { programId: program.id, academicYearId: year.id, semesterId: odd.id, classes };
}

// --- 2. faculty ------------------------------------------------------------

async function seedFaculty(programId: string, facultyRoleId: string) {
  const { faculty, rejected } = readFaculty(FACULTY_FILE);
  failures.push(...rejected);
  console.log(`\nFaculty: ${faculty.length} to import.`);
  if (DRY_RUN) return;

  let created = 0;
  let skipped = 0;

  await mapWithConcurrency(faculty, 5, async (f) => {
    if (await db.user.findUnique({ where: { email: f.email } })) {
      skipped++;
      return;
    }

    const { uid, tempPassword } = await ensureFirebaseUser(f.email, f.displayName);
    try {
      await db.user.create({
        data: {
          firebaseUid: uid,
          email: f.email,
          displayName: f.displayName,
          programId,
          mustChangePassword: true,
          roles: { create: { roleId: facultyRoleId } },
          facultyProfile: {
            create: {
              staffId: f.staffId,
              designation: f.designation,
              phone: f.phone,
            },
          },
        },
      });
      created++;
      if (tempPassword) {
        credentials.push({
          role: "Faculty",
          name: f.displayName,
          login: f.email,
          email: f.email,
          tempPassword,
        });
      }
    } catch (e) {
      // All-or-nothing: undo the Firebase identity we just minted.
      if (tempPassword) await auth().deleteUser(uid).catch(() => {});
      failures.push({
        sheet: "Faculty",
        excelRow: f.excelRow,
        registerNumber: f.staffId,
        name: f.displayName,
        reason: `Neon write failed: ${(e as Error).message}`,
      });
    }
  });

  console.log(`  Faculty created: ${created}, already present: ${skipped}.`);
}

// --- 3. students -----------------------------------------------------------

async function seedStudents(
  programId: string,
  studentRoleId: string,
  academicYearId: string,
  classes: Map<string, string>,
  students: ReturnType<typeof readStudents>["students"],
) {
  console.log(`\nStudents: ${students.length} to import.`);
  if (DRY_RUN) return;

  let created = 0;
  let skipped = 0;
  let done = 0;

  await mapWithConcurrency(students, 8, async (s) => {
    done++;
    if (done % 50 === 0) console.log(`  …${done}/${students.length}`);

    if (await db.user.findUnique({ where: { email: s.email } })) {
      skipped++;
      return;
    }

    const classId = classes.get(`${s.year}-${s.section}`);
    if (!classId) {
      failures.push({ ...s, name: s.displayName, reason: `No class for ${s.year}-${s.section}.` });
      return;
    }

    const { uid, tempPassword } = await ensureFirebaseUser(s.email, s.displayName);
    try {
      await db.user.create({
        data: {
          firebaseUid: uid,
          email: s.email,
          displayName: s.displayName,
          programId,
          mustChangePassword: true,
          roles: { create: { roleId: studentRoleId } },
          student: {
            create: {
              registerNumber: s.registerNumber,
              rollNumber: s.rollNumber,
              dateOfBirth: s.dateOfBirth,
              phone: s.phone,
              gender: s.gender,
              // Enrolled in the same transaction — no "not enrolled" limbo.
              enrollments: { create: { classId, academicYearId } },
            },
          },
        },
      });
      created++;
      if (tempPassword) {
        credentials.push({
          role: "Student",
          name: s.displayName,
          login: s.registerNumber, // students log in with their register number
          email: s.email,
          tempPassword,
        });
      }
    } catch (e) {
      if (tempPassword) await auth().deleteUser(uid).catch(() => {});
      failures.push({
        sheet: s.sheet,
        excelRow: s.excelRow,
        registerNumber: s.registerNumber,
        name: s.displayName,
        reason: `Neon write failed: ${(e as Error).message}`,
      });
    }
  });

  console.log(`  Students created: ${created}, already present: ${skipped}.`);
}

// --- reports ---------------------------------------------------------------

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function writeReports(rejected: RejectedRow[]) {
  mkdirSync(OUT_DIR, { recursive: true });

  const rejectPath = path.join(OUT_DIR, "import-rejected.csv");
  const all = [...rejected, ...failures];
  writeFileSync(
    rejectPath,
    ["Sheet,Excel row,Register/Staff no,Name,Reason"]
      .concat(all.map((r) => [r.sheet, String(r.excelRow), r.registerNumber, r.name, r.reason].map(csvCell).join(",")))
      .join("\n") + "\n",
    "utf8",
  );
  console.log(`\nRejected rows report: ${rejectPath} (${all.length} rows)`);

  if (credentials.length) {
    const credPath = path.join(OUT_DIR, "import-credentials.csv");
    writeFileSync(
      credPath,
      ["Role,Name,Login,Email,Temp password"]
        .concat(credentials.map((c) => [c.role, c.name, c.login, c.email, c.tempPassword].map(csvCell).join(",")))
        .join("\n") + "\n",
      "utf8",
    );
    console.log(`Credentials (deliver, then delete): ${credPath} (${credentials.length} accounts)`);
  }
}

// --- main ------------------------------------------------------------------

async function main() {
  console.log(DRY_RUN ? "DRY RUN — parsing only, nothing will be written.\n" : "Importing CSE data…\n");

  const { students, rejected } = readStudents(STUDENT_FILE);
  console.log(`Parsed ${students.length} students (${rejected.length} rejected).`);

  // The classes to create are whatever the sheets actually contain.
  const sections = new Map<number, Set<string>>();
  for (const s of students) {
    if (!sections.has(s.year)) sections.set(s.year, new Set());
    sections.get(s.year)!.add(s.section);
  }

  if (DRY_RUN) {
    const counts: Record<string, number> = {};
    for (const s of students) counts[`${s.year}-${s.section}`] = (counts[`${s.year}-${s.section}`] ?? 0) + 1;
    console.log("Classes that would be created:", JSON.stringify(counts));
    readFaculty(FACULTY_FILE);
    writeReports(rejected);
    return;
  }

  const [studentRole, facultyRole] = await Promise.all([
    db.role.findUniqueOrThrow({ where: { name: "Student" } }),
    db.role.findUniqueOrThrow({ where: { name: "Faculty" } }),
  ]);

  console.log("\nStructure + time…");
  const { programId, academicYearId, classes } = await seedStructureAndTime(sections);

  await seedFaculty(programId, facultyRole.id);
  await seedStudents(programId, studentRole.id, academicYearId, classes, students);

  writeReports(rejected);

  const [users, studentCount, facultyCount, enrollments] = await Promise.all([
    db.user.count(),
    db.student.count(),
    db.facultyProfile.count(),
    db.enrollment.count(),
  ]);
  console.log(
    `\nDone. Users: ${users} | Students: ${studentCount} | Faculty: ${facultyCount} | Enrollments: ${enrollments}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
