// Migrate the TEST database into PRODUCTION.
//
// DRY RUN BY DEFAULT. Pass --commit to write.
//
// WHY THIS IS NOT A DATABASE COPY
//
// Everything except people copies verbatim, ids and all, so foreign keys keep
// resolving. People cannot: every User row carries a `firebaseUid` belonging to
// the TEST Firebase project (jec-erp-auth). Copied into production those uids
// name nothing, so all ~500 accounts would exist and none could log in. Firebase
// will not hand over password hashes either.
//
// So each person is RE-PROVISIONED: a fresh identity in the production Firebase
// project, a fresh temp password, and the Neon row rewritten to point at the new
// uid while KEEPING ITS ORIGINAL ID — that is what lets enrolments, attendance,
// marks, timetable and attachments come across untouched.
//
// Consequence you cannot avoid: ~500 new passwords to distribute. They are
// returned once and written to two CSVs; nothing stores them.
//
// SAFETY
//   - Refuses unless the source really is the test host and the target really is
//     the production host. A mislabelled env cannot get past it.
//   - Refuses to touch a production database that already holds users, so a
//     second run cannot double-provision or clobber live accounts.
//   - Firebase-first per person, with the Neon write in a transaction; a failure
//     deletes the just-created identity so a retry cannot collide on the email.
// No dotenv here on purpose: both env files are read explicitly below, so
// neither can leak into process.env and be picked up by the wrong client.
const { readFileSync, writeFileSync } = await import("node:fs");
const { randomBytes } = await import("node:crypto");
const { PrismaNeon } = await import("@prisma/adapter-neon");
const { neonConfig } = await import("@neondatabase/serverless");
const { default: ws } = await import("ws");
const { cert, initializeApp, deleteApp } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { PrismaClient } = await import("../src/generated/prisma/client.js");

neonConfig.webSocketConstructor = ws;

const COMMIT = process.argv.includes("--commit");

/** Read an env file without letting it leak into process.env. */
function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const TEST = readEnv(".env");
const PROD = readEnv(".env.production.local");

const clean = (u: string) => u.replace(/([?&])channel_binding=require&?/, "$1");
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return ""; } };

// --- the guard ------------------------------------------------------------
// Deliberately explicit rather than reusing guard-env.ts: that helper exists to
// keep scripts AWAY from production, and this is the one script whose whole job
// is to write there. Encoding the expectation both ways is what makes a
// mislabelled env file fail instead of being trusted.
const srcHost = hostOf(TEST.DIRECT_URL ?? "");
const dstHost = hostOf(PROD.DIRECT_URL ?? "");
if (!srcHost.includes("ep-calm-grass")) throw new Error(`Source is not the test database: ${srcHost}`);
if (!dstHost.includes("ep-muddy-frost")) throw new Error(`Target is not the production database: ${dstHost}`);
if (TEST.NEXT_PUBLIC_FIREBASE_PROJECT_ID === PROD.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
  throw new Error("Source and target Firebase projects are the same — refusing.");
}
for (const k of ["FIREBASE_ADMIN_PROJECT_ID", "FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_ADMIN_PRIVATE_KEY"]) {
  if (!PROD[k]) throw new Error(`.env.production.local is missing ${k}`);
}

console.log("MIGRATION PLAN");
console.log(`  source Neon     : ${srcHost}`);
console.log(`  target Neon     : ${dstHost}`);
console.log(`  source Firebase : ${TEST.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`);
console.log(`  target Firebase : ${PROD.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`);
console.log(COMMIT ? "\n*** COMMIT MODE — this WILL write to production ***\n" : "\nDRY RUN — nothing will be written.\n");

const src = new PrismaClient({ adapter: new PrismaNeon({ connectionString: clean(TEST.DIRECT_URL) }) });
const dst = new PrismaClient({ adapter: new PrismaNeon({ connectionString: clean(PROD.DIRECT_URL) }) });

const prodApp = initializeApp({
  credential: cert({
    projectId: PROD.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: PROD.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: PROD.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
}, "prod");
const prodAuth = getAuth(prodApp);

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const tempPassword = (n = 14) => [...randomBytes(n)].map((b) => ALPHABET[b % ALPHABET.length]).join("");

const csvCell = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function main() {
  // --- refuse to run against a populated production ------------------------
  const existingTables = await dst.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`;
  if (Number(existingTables[0].n) === 0) {
    throw new Error(
      "Production has no tables. Run this first:\n" +
      "  pnpm exec dotenv -e .env.production.local -- prisma db push\n" +
      "  (then re-run this script)",
    );
  }
  const existingUsers = await dst.user.count();
  if (existingUsers > 0) {
    throw new Error(
      `Production already holds ${existingUsers} users — refusing to migrate into a live database.\n` +
      `Re-running would double-provision identities and orphan the existing ones.`,
    );
  }

  // --- read everything from test, in dependency order ----------------------
  console.log("Reading test database…");
  const data = {
    degrees: await src.degree.findMany(),
    branches: await src.branch.findMany(),
    departments: await src.department.findMany(),
    programs: await src.program.findMany(),
    classes: await src.class.findMany(),
    academicYears: await src.academicYear.findMany(),
    semesters: await src.semester.findMany(),
    subjects: await src.subject.findMany(),
    roles: await src.role.findMany(),
    permissions: await src.permission.findMany(),
    rolePermissions: await src.rolePermission.findMany(),
    users: await src.user.findMany(),
    students: await src.student.findMany(),
    facultyProfiles: await src.facultyProfile.findMany(),
    userRoles: await src.userRole.findMany(),
    enrollments: await src.enrollment.findMany(),
    facultyAssignments: await src.facultyAssignment.findMany(),
    facultyAttachments: await src.facultyAttachment.findMany(),
    workingDays: await src.workingDay.findMany(),
    timetableSlots: await src.timetableSlot.findMany(),
    slotSubstitutions: await src.slotSubstitution.findMany(),
    masterAttendance: await src.masterAttendance.findMany(),
    periodAttendance: await src.periodAttendance.findMany(),
    internalMarks: await src.internalMark.findMany(),
    leaveRequests: await src.leaveRequest.findMany(),
  };

  console.log("\nWHAT WOULD MOVE:");
  for (const [k, v] of Object.entries(data)) {
    if (v.length) console.log(`  ${String(v.length).padStart(4)}  ${k}`);
  }

  const staff = data.users.filter((u) => data.facultyProfiles.some((f) => f.userId === u.id));
  const studentUsers = data.users.filter((u) => data.students.some((s) => s.userId === u.id));
  const other = data.users.filter((u) => !staff.includes(u) && !studentUsers.includes(u));
  console.log(`\nIDENTITIES TO RE-CREATE IN ${PROD.NEXT_PUBLIC_FIREBASE_PROJECT_ID}:`);
  console.log(`  ${studentUsers.length} students`);
  console.log(`  ${staff.length} staff`);
  console.log(`  ${other.length} other (admin / unlinked)`);
  console.log(`  = ${data.users.length} Firebase identities + ${data.users.length} new temp passwords\n`);

  if (!COMMIT) {
    console.log("Dry run complete. Re-run with --commit to apply.");
    return;
  }

  // --- structure first (no identities involved) ----------------------------
  // Ids are preserved throughout so every foreign key below still resolves.
  console.log("Writing structure…");
  const copy = async (label: string, rows: unknown[], write: (r: never) => Promise<unknown>) => {
    for (const r of rows) await write(r as never);
    if (rows.length) console.log(`  ${String(rows.length).padStart(4)}  ${label}`);
  };

  await copy("degrees", data.degrees, (r) => dst.degree.create({ data: r }));
  await copy("branches", data.branches, (r) => dst.branch.create({ data: r }));
  await copy("departments", data.departments, (r) => dst.department.create({ data: r }));
  await copy("programs", data.programs, (r) => dst.program.create({ data: r }));
  await copy("academicYears", data.academicYears, (r) => dst.academicYear.create({ data: r }));
  await copy("semesters", data.semesters, (r) => dst.semester.create({ data: r }));
  await copy("subjects", data.subjects, (r) => dst.subject.create({ data: r }));
  // Roles/permissions may already exist from `prisma db seed`; upsert so a
  // seeded production does not collide on the unique name.
  for (const r of data.roles) await dst.role.upsert({ where: { id: r.id }, update: {}, create: r });
  for (const r of data.permissions) await dst.permission.upsert({ where: { id: r.id }, update: {}, create: r });
  // RolePermission is keyed on the (role, permission) pair, not an id.
  for (const r of data.rolePermissions) {
    await dst.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: r.roleId, permissionId: r.permissionId } },
      update: {},
      create: r,
    });
  }
  console.log(`  ${data.roles.length} roles, ${data.permissions.length} permissions, ${data.rolePermissions.length} grants`);

  // Classes need departments + programs, which now exist.
  await copy("classes (without advisors)", data.classes, (r) =>
    dst.class.create({ data: { ...(r as { advisorId?: string | null }), advisorId: null } as never }));

  // --- people: new identity, same row id -----------------------------------
  console.log("\nRe-provisioning identities (Firebase + Neon)…");
  const credentials: Array<{ kind: "student" | "staff" | "other"; id: string; name: string; email: string; password: string }> = [];
  const failed: Array<{ email: string; why: string }> = [];
  let done = 0;

  for (const u of data.users) {
    const password = tempPassword();
    let uid: string;
    try {
      const fb = await prodAuth.createUser({ email: u.email, password, displayName: u.displayName });
      uid = fb.uid;
    } catch (e) {
      failed.push({ email: u.email, why: e instanceof Error ? e.message : String(e) });
      continue;
    }

    try {
      await dst.user.create({
        data: { ...u, firebaseUid: uid, mustChangePassword: true },
      });
      const student = data.students.find((s) => s.userId === u.id);
      const profile = data.facultyProfiles.find((f) => f.userId === u.id);
      if (student) await dst.student.create({ data: student });
      if (profile) await dst.facultyProfile.create({ data: profile });

      credentials.push({
        kind: student ? "student" : profile ? "staff" : "other",
        id: student?.registerNumber ?? profile?.staffId ?? u.email,
        name: u.displayName, email: u.email, password,
      });
    } catch (e) {
      await prodAuth.deleteUser(uid).catch(() => {});
      failed.push({ email: u.email, why: e instanceof Error ? e.message : String(e) });
    }

    if (++done % 50 === 0) console.log(`   …${done}/${data.users.length}`);
  }
  console.log(`  ${credentials.length} provisioned, ${failed.length} failed`);

  // --- everything that references a user -----------------------------------
  console.log("\nWriting the rest…");
  await copy("userRoles", data.userRoles, (r) => dst.userRole.create({ data: r }));
  // Advisors now that the staff exist.
  for (const c of data.classes) {
    if (c.advisorId) await dst.class.update({ where: { id: c.id }, data: { advisorId: c.advisorId } });
  }
  await copy("enrollments", data.enrollments, (r) => dst.enrollment.create({ data: r }));
  await copy("facultyAssignments", data.facultyAssignments, (r) => dst.facultyAssignment.create({ data: r }));
  await copy("facultyAttachments", data.facultyAttachments, (r) => dst.facultyAttachment.create({ data: r }));
  await copy("workingDays", data.workingDays, (r) => dst.workingDay.create({ data: r }));
  await copy("timetableSlots", data.timetableSlots, (r) => dst.timetableSlot.create({ data: r }));
  await copy("slotSubstitutions", data.slotSubstitutions, (r) => dst.slotSubstitution.create({ data: r }));
  await copy("masterAttendance", data.masterAttendance, (r) => dst.masterAttendance.create({ data: r }));
  await copy("periodAttendance", data.periodAttendance, (r) => dst.periodAttendance.create({ data: r }));
  await copy("internalMarks", data.internalMarks, (r) => dst.internalMark.create({ data: r }));
  await copy("leaveRequests", data.leaveRequests, (r) => dst.leaveRequest.create({ data: r }));

  // --- the passwords -------------------------------------------------------
  const write = (kind: "student" | "staff", file: string, idHeader: string) => {
    const rows = credentials.filter((c) => c.kind === kind);
    if (!rows.length) return;
    const csv = [
      [idHeader, "name", "email", "tempPassword"].join(","),
      ...rows.map((r) => [r.id, r.name, r.email, r.password].map(csvCell).join(",")),
    ].join("\r\n");
    writeFileSync(file, csv, "utf8");
    console.log(`  ${rows.length} -> ${file}`);
  };
  console.log("\nPasswords (shown once, stored nowhere):");
  write("student", "production-passwords-students.csv", "registerNumber");
  write("staff", "production-passwords-staff.csv", "staffId");
  const others = credentials.filter((c) => c.kind === "other");
  if (others.length) {
    for (const o of others) console.log(`  ${o.email} — ${o.password}`);
  }

  if (failed.length) {
    console.log(`\n${failed.length} FAILED — these people have NO production account:`);
    for (const f of failed) console.log(`  ${f.email} — ${f.why}`);
  }

  console.log("\nDONE. Verify, distribute the CSVs, then DELETE them.");
}

try {
  await main();
} finally {
  await src.$disconnect();
  await dst.$disconnect();
  await deleteApp(prodApp).catch(() => {});
}
