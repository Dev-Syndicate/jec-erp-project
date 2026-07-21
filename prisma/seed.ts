// Seed — plants configurable-RBAC baseline + bootstraps the Super Admin.
//
// Run: `pnpm exec prisma db seed`  (or automatically after `prisma migrate reset`).
//
// This is the "seeded once via a protected script" path from CLAUDE.md: there
// is no higher role that could create the Super Admin, so it's done here. The
// script is IDEMPOTENT — safe to re-run; it upserts and never duplicates.
//
// It runs OUTSIDE Next.js (plain tsx), so it cannot import src/lib/db.ts or
// src/lib/firebase-admin.ts (those are `server-only`). It builds its own client.
//
// NOTE: it uses the WebSocket adapter (PrismaNeon), not the HTTP one the app
// uses at runtime. `upsert` runs inside an implicit transaction, and Neon's
// HTTP mode does not support transactions — only the WS driver does.
import "dotenv/config";

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "../src/generated/prisma/client.js";

neonConfig.webSocketConstructor = ws;
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// --- clients ---------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — cannot seed.`);
  return v;
}

// WS adapter over the DIRECT (unpooled) connection.
const adapter = new PrismaNeon({ connectionString: requireEnv("DIRECT_URL") });
const db = new PrismaClient({ adapter });

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

// --- RBAC baseline ---------------------------------------------------------
// CASL-shaped permissions: action + subject. "manage"/"all" is the wildcard CASL
// grants for full access (the Super Admin's permission). The rest are the
// fine-grained catalog the admin composes custom roles from — the RBAC admin
// screen renders exactly these, so keep this list the source of truth.
const PERMISSIONS: Array<{ action: string; subject: string }> = [
  { action: "manage", subject: "all" }, // Super Admin: everything, everywhere

  { action: "manage", subject: "Student" },
  { action: "read", subject: "Student" },
  { action: "manage", subject: "Faculty" },
  { action: "read", subject: "Faculty" },
  { action: "manage", subject: "Subject" },
  { action: "read", subject: "Subject" },
  { action: "manage", subject: "Timetable" },
  { action: "read", subject: "Timetable" },
  { action: "manage", subject: "Attendance" }, // mark ANY class in scope (HOD/SA)
  { action: "mark", subject: "Attendance" }, // mark only what you teach/advise (Faculty)
  { action: "read", subject: "Attendance" },
  { action: "enter", subject: "Marks" },
  { action: "read", subject: "Marks" },
  { action: "manage", subject: "Class" },
  { action: "read", subject: "Class" },
  { action: "manage", subject: "Program" },
  { action: "read", subject: "Program" },
  { action: "manage", subject: "Degree" },
  { action: "read", subject: "Degree" },
  { action: "manage", subject: "Branch" },
  { action: "read", subject: "Branch" },
  { action: "manage", subject: "AcademicYear" },
  { action: "manage", subject: "Semester" },
  { action: "manage", subject: "Role" }, // manage the RBAC config itself
];

// Default permission sets for the seeded roles — a sensible starting point the
// admin can refine. Scope (PROGRAM) restricts these to the holder's own program;
// that condition is applied by the CASL ability factory (Pass B), not here.
// [action, subject] pairs; Super Admin gets the wildcard.
const DEFAULT_GRANTS: Record<string, Array<[string, string]>> = {
  "Super Admin": [["manage", "all"]],
  HOD: [
    ["manage", "Student"],
    ["manage", "Faculty"],
    ["manage", "Subject"],
    ["manage", "Timetable"],
    ["manage", "Attendance"], // mark any class in their program (covers mark + read)
    ["read", "Attendance"],
    ["enter", "Marks"],
    ["read", "Marks"],
    ["read", "Class"],
    ["read", "Program"],
  ],
  Faculty: [
    ["read", "Student"],
    ["read", "Subject"],
    ["read", "Timetable"],
    ["read", "Class"],
    ["mark", "Attendance"],
    ["read", "Attendance"],
    ["enter", "Marks"],
    ["read", "Marks"],
  ],
  Student: [
    ["read", "Attendance"],
    ["read", "Marks"],
    ["read", "Timetable"],
  ],
};

// The four baseline roles. isSystem=true means the UI can't delete them.
// Permission composition beyond Super Admin is intentionally left to the admin
// console (RBAC is configurable) — we only guarantee Super Admin can bootstrap.
//
// SCOPE MATTERS: Super Admin is INSTITUTION (spans every program, bootstrap-only,
// never hand-assigned); the rest are PROGRAM (act within their own program). The
// faculty role picker relies on this — it only offers PROGRAM-scoped roles, so a
// mis-scoped Super Admin would wrongly appear as assignable.
const SYSTEM_ROLES = [
  { name: "Super Admin", scope: "INSTITUTION" },
  { name: "HOD", scope: "PROGRAM" },
  { name: "Faculty", scope: "PROGRAM" },
  { name: "Student", scope: "PROGRAM" },
] as const;

async function seedRbac() {
  for (const p of PERMISSIONS) {
    await db.permission.upsert({
      where: { action_subject: { action: p.action, subject: p.subject } },
      update: {},
      create: p,
    });
  }

  for (const r of SYSTEM_ROLES) {
    await db.role.upsert({
      where: { name: r.name },
      update: { isSystem: true, scope: r.scope },
      create: { name: r.name, isSystem: true, scope: r.scope },
    });
  }

  // Grant each seeded role its default permission set (idempotent). This only
  // ADDS the baseline grants — it never revokes, so an admin's later edits in the
  // RBAC console survive a re-seed.
  for (const [roleName, grants] of Object.entries(DEFAULT_GRANTS)) {
    const role = await db.role.findUniqueOrThrow({ where: { name: roleName } });
    for (const [action, subject] of grants) {
      const permission = await db.permission.findUniqueOrThrow({
        where: { action_subject: { action, subject } },
      });
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const superAdminRole = await db.role.findUniqueOrThrow({ where: { name: "Super Admin" } });
  return { superAdminRole };
}

// --- Super Admin bootstrap -------------------------------------------------
// Creates (or reuses) the Firebase account, then the linked Neon User, then the
// Super Admin role assignment. mustChangePassword=true — they reset on first
// login (no higher role exists to reset it for them).
async function seedSuperAdmin(superAdminRoleId: string) {
  const email = requireEnv("SUPER_ADMIN_EMAIL");
  const password = requireEnv("SUPER_ADMIN_TEMP_PASSWORD");
  const displayName = process.env.SUPER_ADMIN_NAME ?? "Super Admin";

  // Reuse the Firebase user if it already exists (idempotency).
  let firebaseUid: string;
  try {
    const existing = await adminAuth.getUserByEmail(email);
    firebaseUid = existing.uid;
    console.log(`  Firebase user already exists for ${email} (${firebaseUid})`);
  } catch {
    const created = await adminAuth.createUser({ email, password, displayName });
    firebaseUid = created.uid;
    console.log(`  Created Firebase user ${email} (${firebaseUid})`);
  }

  const user = await db.user.upsert({
    where: { firebaseUid },
    update: { email, displayName },
    create: {
      firebaseUid,
      email,
      displayName,
      mustChangePassword: true,
      // Super Admin has NO program (spans every program).
    },
  });

  await db.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRoleId } },
    update: {},
    create: { userId: user.id, roleId: superAdminRoleId },
  });

  console.log(`  Linked Neon User ${user.id} and granted Super Admin role.`);
}

// Note: admission lookups (religion/category/caste) and India geo are NOT seeded
// here — they belong to the student-records slice, deferred with the admission
// detail tables. Geo is served from src/data/india-states-districts.json.

async function main() {
  console.log("Seeding RBAC baseline…");
  const { superAdminRole } = await seedRbac();
  console.log("Bootstrapping Super Admin…");
  await seedSuperAdmin(superAdminRole.id);
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
