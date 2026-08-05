// Provision the Science & Humanities and MCA faculty supplied by the college.
//
// Real staff records, so the rules from the import path apply here too: nothing
// is guessed. Every field below came from the college's list except `designation`
// and `staffId`, which the schema requires and the list didn't carry —
// "Assistant Professor" was chosen explicitly (matching all 13 existing CSE
// records, and Kannadasan's "/AP"), and staffIds follow the existing SNH/MCA
// convention. Correct either per-person in the Faculty screen afterwards.
//
// Firebase-first, exactly like src/lib/provisioning.ts: create the identity, then
// the Neon rows in a transaction, and delete the Firebase user if the DB write
// fails so a retry can't collide on the email. Temp passwords are returned ONCE
// and written to a CSV — nothing stores them.
//
// IDEMPOTENT: an email or staffId that already exists is SKIPPED, not
// overwritten, so a re-run after a partial failure finishes the job instead of
// duplicating or clobbering.
//
// TEST DB ONLY (guard-env).
// .env is loaded FIRST, before the guard: assertTestEnv reads ERP_ENV and the
// Neon host, so an unpopulated env would make it refuse for the wrong reason
// (looking unset rather than looking like production). Static imports hoist, so
// this is a dynamic import to force the ordering.
const { config } = await import("dotenv");
config({ path: ".env" });

const { assertTestEnv } = await import("./guard-env.js");
assertTestEnv("seed-sh-mca-faculty.mts");

import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

// Also dynamic, for the same hoisting reason: these build clients from env at
// module scope, so they must not evaluate until dotenv has run above.
const { PrismaNeon } = await import("@prisma/adapter-neon");
const { neonConfig } = await import("@neondatabase/serverless");
const { default: ws } = await import("ws");
const { cert, initializeApp } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { PrismaClient } = await import("../src/generated/prisma/client.js");

neonConfig.webSocketConstructor = ws;

const db = new PrismaClient({
  adapter: new PrismaNeon({
    connectionString: (process.env.DIRECT_URL ?? "").replace(/([?&])channel_binding=require&?/, "$1"),
  }),
});

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }),
});
const auth = getAuth();

// Same alphabet/length as src/lib/provisioning.ts — ambiguous glyphs removed so
// a password can be read aloud or typed from paper without confusion.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function tempPassword(length = 14): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

type Row = {
  staffId: string;
  displayName: string;
  email: string;
  phone: string;
  departmentCode: "S&H" | "MCA";
};

// Transcribed verbatim from the college's list. Names keep their given form
// (including the "/AP" suffix stripped from Kannadasan, which was a designation
// not part of his name). Phone numbers are digits-only.
const ROWS: Row[] = [
  { staffId: "SNH001", displayName: "Dr. C. Nithyapriya", email: "nithyapriya@jeppiaarcollege.org", phone: "8144332445", departmentCode: "S&H" },
  { staffId: "SNH002", displayName: "Dr. G. Jagadeesan", email: "jagadeesan@jeppiaarcollege.org", phone: "9941429033", departmentCode: "S&H" },
  { staffId: "SNH003", displayName: "Dr. A. Thiripuram", email: "thiripuram@jeppiaarcollege.org", phone: "8754141205", departmentCode: "S&H" },
  { staffId: "SNH004", displayName: "Dr. C. Kannadasan", email: "kannadasan@jeppiaarcollege.org", phone: "9003878010", departmentCode: "S&H" },
  { staffId: "SNH005", displayName: "M. Ayesha Thasneem", email: "ayeshathasneemm@jeppiaarcollege.org", phone: "9566669385", departmentCode: "S&H" },
  // NOTE: the supplied email for "Ms Latha M" is Princylatha@… — it does not
  // follow the name the way every other row does. Used EXACTLY as given (lower-
  // cased, as the app does for all logins) rather than "corrected" to a guess,
  // since the email IS the login credential. Verify before handing over.
  { staffId: "SNH006", displayName: "Ms. Latha M", email: "princylatha@jeppiaarcollege.org", phone: "8939507357", departmentCode: "S&H" },
  { staffId: "SNH007", displayName: "Dr. P. Nirvin", email: "nirvin@jeppiaarcollege.org", phone: "8807226065", departmentCode: "S&H" },
  { staffId: "SNH008", displayName: "Ms. Manjula", email: "manjula@jeppiaarcollege.org", phone: "9789354711", departmentCode: "S&H" },
  { staffId: "MCA001", displayName: "Mrs. Nalini R", email: "nalinir@jeppiaarcollege.org", phone: "9059361100", departmentCode: "MCA" },
];

const DESIGNATION = "Assistant Professor";

type Result = { row: Row; status: "created" | "skipped" | "error"; reason?: string; password?: string };

async function main() {
  // --- the MCA department -------------------------------------------------
  // Upsert by code so a re-run doesn't create a second one.
  const mca = await db.department.upsert({
    where: { code: "MCA" },
    update: {},
    create: { code: "MCA", name: "Master of Computer Applications Department" },
    select: { id: true, code: true, name: true },
  });
  console.log(`MCA department ready: ${mca.name} (${mca.code})\n`);

  const departments = await db.department.findMany({ select: { id: true, code: true } });
  const deptByCode = new Map(departments.map((d) => [d.code, d.id]));

  const facultyRole = await db.role.findUnique({ where: { name: "Faculty" }, select: { id: true } });
  if (!facultyRole) throw new Error("The Faculty role is not seeded. Run `prisma db seed` first.");

  const results: Result[] = [];

  for (const row of ROWS) {
    const departmentId = deptByCode.get(row.departmentCode);
    if (!departmentId) {
      results.push({ row, status: "error", reason: `No ${row.departmentCode} department.` });
      continue;
    }

    // Skip rather than clobber: a re-run after a partial failure should finish
    // the job, never overwrite a live account or reset someone's password.
    const clash = await db.user.findFirst({
      where: { OR: [{ email: row.email }, { facultyProfile: { staffId: row.staffId } }] },
      select: { email: true },
    });
    if (clash) {
      results.push({ row, status: "skipped", reason: `Already exists (${clash.email}).` });
      continue;
    }

    const password = tempPassword();
    let uid: string;
    try {
      const fbUser = await auth.createUser({
        email: row.email,
        password,
        displayName: row.displayName,
      });
      uid = fbUser.uid;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ row, status: "error", reason: `Firebase: ${msg}` });
      continue;
    }

    try {
      await db.user.create({
        data: {
          firebaseUid: uid,
          email: row.email,
          displayName: row.displayName,
          // Staff carry no award — the department is what scopes them.
          mustChangePassword: true,
          roles: { create: { roleId: facultyRole.id } },
          facultyProfile: {
            create: {
              departmentId,
              staffId: row.staffId,
              designation: DESIGNATION,
              phone: row.phone,
            },
          },
        },
      });
      results.push({ row, status: "created", password });
    } catch (e) {
      // Undo the Firebase identity so the operation is all-or-nothing and a
      // retry won't collide on the email.
      await auth.deleteUser(uid).catch((err) =>
        console.error(`  ! failed to roll back Firebase user ${uid}:`, err.message),
      );
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ row, status: "error", reason: msg });
    }
  }

  // --- report -------------------------------------------------------------
  console.log("RESULTS");
  for (const r of results) {
    const tag = r.status.toUpperCase().padEnd(8);
    console.log(`  ${tag} ${r.row.staffId.padEnd(8)} ${r.row.displayName.padEnd(24)} ${r.row.email}${r.reason ? ` — ${r.reason}` : ""}`);
  }

  const created = results.filter((r) => r.status === "created");
  const skipped = results.filter((r) => r.status === "skipped");
  const errored = results.filter((r) => r.status === "error");
  console.log(`\n${created.length} created, ${skipped.length} skipped, ${errored.length} failed`);

  // --- the one-time passwords --------------------------------------------
  if (created.length > 0) {
    const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [
      ["staffId", "name", "email", "department", "tempPassword"].join(","),
      ...created.map((r) =>
        [r.row.staffId, r.row.displayName, r.row.email, r.row.departmentCode, r.password ?? ""]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n");

    const out = "faculty-passwords-sh-mca.csv";
    writeFileSync(out, csv, "utf8");
    console.log(`\nTemp passwords written to ${out}`);
    console.log("These are shown ONCE and are not stored anywhere else.");
    console.log("Hand them over, then DELETE that file. Everyone must reset on first login.");
  }
}

try {
  await main();
} finally {
  await db.$disconnect();
}
