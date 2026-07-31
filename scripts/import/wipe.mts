// Wipe the ERP data — everything EXCEPT the admin accounts and the RBAC baseline.
//
// Run: pnpm exec tsx scripts/import/wipe.mts --yes
//
// KEPT:    Role, Permission, RolePermission (the RBAC baseline the seed plants)
//          + every User holding an INSTITUTION-scoped role (the Super Admins).
// DELETED: every other User (students + faculty) and their Firebase identity,
//          plus all structure, curriculum, records and time rows.
//
// Survival is decided ENTIRELY by the RBAC data: hold an INSTITUTION-scoped
// role or be deleted. There is no by-email exemption list — if an account must
// survive a wipe, give it an INSTITUTION role rather than special-casing it.
//
// Firebase identities are deleted alongside the Neon rows. Leaving them behind
// would orphan the identity and, worse, make a re-import fail on "email already
// exists" for anyone re-added later.
//
// Runs outside Next (plain tsx), so it builds its own Prisma + Firebase clients
// exactly like prisma/seed.ts does.
import "dotenv/config";

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { assertTestEnv } from "../guard-env.js";

// Before ANY client is built: this deletes students and their Firebase
// identities, so it must never run against production. Throws if ERP_ENV
// is not "test" or if the connection string looks like prod.
assertTestEnv("wipe.mts");

neonConfig.webSocketConstructor = ws;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — cannot run.`);
  return v;
}

const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: requireEnv("DIRECT_URL") }) });

const firebaseApp =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: requireEnv("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: requireEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: requireEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
const adminAuth = getAuth(firebaseApp);

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error(
      "Refusing to run without --yes.\n" +
        "This DELETES all students, faculty, classes, subjects, timetable,\n" +
        "attendance, marks and leave requests. Admins + RBAC are preserved.",
    );
    process.exitCode = 1;
    return;
  }

  // --- who survives --------------------------------------------------------
  // "Admin" is defined by the RBAC data, not by a hard-coded email: any user
  // holding an INSTITUTION-scoped role. That keeps this honest if roles change.
  const adminUsers = await db.user.findMany({
    where: { roles: { some: { role: { scope: "INSTITUTION" } } } },
    select: { id: true, email: true, firebaseUid: true, displayName: true },
  });
  if (adminUsers.length === 0) {
    throw new Error(
      "No INSTITUTION-scoped user found — refusing to wipe, or you would be locked out.",
    );
  }
  const keepUserIds = new Set(adminUsers.map((u) => u.id));

  console.log("Preserving admin accounts:");
  for (const a of adminUsers) console.log(`  - ${a.email} (${a.displayName})`);

  const doomed = await db.user.findMany({
    where: { id: { notIn: [...keepUserIds] } },
    select: { id: true, email: true, firebaseUid: true },
  });
  console.log(`\nDeleting ${doomed.length} non-admin Neon users and all ERP data…`);

  // --- Neon: delete children before parents -------------------------------
  // Ordered by FK dependency. Everything here is data owned by the wipe, so
  // deleteMany with no filter is intended.
  const steps: Array<[string, () => Promise<{ count: number }>]> = [
    ["periodAttendance", () => db.periodAttendance.deleteMany()],
    ["masterAttendance", () => db.masterAttendance.deleteMany()],
    ["internalMark", () => db.internalMark.deleteMany()],
    ["leaveRequest", () => db.leaveRequest.deleteMany()],
    ["timetableSlot", () => db.timetableSlot.deleteMany()],
    ["facultyAssignment", () => db.facultyAssignment.deleteMany()],
    ["enrollment", () => db.enrollment.deleteMany()],
    ["subject", () => db.subject.deleteMany()],
    ["student", () => db.student.deleteMany()],
    ["facultyProfile", () => db.facultyProfile.deleteMany()],
    // Drop advisor links before deleting the users they point at.
    ["class.advisor unlink", () => db.class.updateMany({ data: { advisorId: null } })],
    ["class", () => db.class.deleteMany()],
    ["semester", () => db.semester.deleteMany()],
    ["academicYear", () => db.academicYear.deleteMany()],
    ["userRole (non-admin)", () => db.userRole.deleteMany({ where: { userId: { notIn: [...keepUserIds] } } })],
    ["user (non-admin)", () => db.user.deleteMany({ where: { id: { notIn: [...keepUserIds] } } })],
    ["program", () => db.program.deleteMany()],
    ["branch", () => db.branch.deleteMany()],
    ["degree", () => db.degree.deleteMany()],
  ];

  for (const [label, run] of steps) {
    const { count } = await run();
    console.log(`  ${label}: ${count}`);
  }

  // Admins were program-scoped in the demo data; their Program is gone now.
  await db.user.updateMany({ where: { id: { in: [...keepUserIds] } }, data: { programId: null } });

  // --- Firebase: remove the identities we just unlinked --------------------
  // Only the admins survive. Any other Firebase identity — including one with
  // no Neon row at all — is deleted, so a stale identity can't linger and block
  // a later import from claiming its email.
  const keepEmails = new Set(adminUsers.map((u) => u.email.toLowerCase()));
  const keepUids = new Set(adminUsers.map((u) => u.firebaseUid));

  const toDelete: string[] = [];
  let page = await adminAuth.listUsers(1000);
  for (;;) {
    for (const u of page.users) {
      const email = (u.email ?? "").toLowerCase();
      if (keepUids.has(u.uid) || (email && keepEmails.has(email))) continue;
      toDelete.push(u.uid);
    }
    if (!page.pageToken) break;
    page = await adminAuth.listUsers(1000, page.pageToken);
  }

  console.log(`\nDeleting ${toDelete.length} Firebase identities…`);
  // deleteUsers takes at most 1000 uids per call.
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 1000) {
    const res = await adminAuth.deleteUsers(toDelete.slice(i, i + 1000));
    deleted += res.successCount;
    for (const err of res.errors) console.warn(`  ! Firebase delete failed: ${err.error.message}`);
  }
  console.log(`  Firebase users deleted: ${deleted}`);

  console.log("\nWipe complete. Admins and the RBAC baseline are intact.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
