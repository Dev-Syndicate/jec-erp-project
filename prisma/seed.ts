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
// CASL-shaped permissions: action + subject. "manage"/"all" is the wildcard
// CASL grants for full access — that's the Super Admin's single permission.
// Fine-grained permissions get added as each feature phase lands.
const PERMISSIONS: Array<{ action: string; subject: string }> = [
  { action: "manage", subject: "all" }, // Super Admin: everything, everywhere
];

// The four baseline roles. isSystem=true means the UI can't delete them.
// Permission composition beyond Super Admin is intentionally left to the admin
// console (RBAC is configurable) — we only guarantee Super Admin can bootstrap.
const SYSTEM_ROLES = ["Super Admin", "HOD", "Teacher", "Student"] as const;

async function seedRbac() {
  for (const p of PERMISSIONS) {
    await db.permission.upsert({
      where: { action_subject: { action: p.action, subject: p.subject } },
      update: {},
      create: p,
    });
  }

  for (const name of SYSTEM_ROLES) {
    await db.role.upsert({
      where: { name },
      update: { isSystem: true },
      create: { name, isSystem: true },
    });
  }

  // Grant "manage all" to Super Admin.
  const superAdminRole = await db.role.findUniqueOrThrow({ where: { name: "Super Admin" } });
  const manageAll = await db.permission.findUniqueOrThrow({
    where: { action_subject: { action: "manage", subject: "all" } },
  });
  await db.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: manageAll.id } },
    update: {},
    create: { roleId: superAdminRole.id, permissionId: manageAll.id },
  });

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
      // Super Admin has NO department (no department filter).
    },
  });

  await db.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRoleId } },
    update: {},
    create: { userId: user.id, roleId: superAdminRoleId },
  });

  console.log(`  Linked Neon User ${user.id} and granted Super Admin role.`);
}

// --- Admission lookups -----------------------------------------------------

// Small optional dropdowns (Basic/Personal Info). Idempotent upserts.
const RELIGIONS = ["Hindu", "Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Parsi", "Other"];
const CATEGORIES = ["General", "OBC", "BC", "MBC", "SC", "ST", "EWS", "Other"];
const CASTES: string[] = []; // caste list is institution-specific; left empty to fill later

async function seedLookups() {
  for (const name of RELIGIONS) {
    await db.religion.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const name of CATEGORIES) {
    await db.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const name of CASTES) {
    await db.caste.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`  Lookups: ${RELIGIONS.length} religions, ${CATEGORIES.length} categories.`);
}

// --- India geo (Country → State → District) --------------------------------
// Reads the bundled dataset (prisma/data/india-states-districts.json) so the
// seed has no runtime API dependency. Idempotent.

async function seedIndiaGeo() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(path.join(here, "data", "india-states-districts.json"), "utf8");
  const data = JSON.parse(raw) as { states: Array<{ state: string; districts: string[] }> };

  const india = await db.country.upsert({
    where: { code: "IN" },
    update: {},
    create: { name: "India", code: "IN" },
  });

  let stateCount = 0;
  let districtCount = 0;
  for (const s of data.states) {
    const state = await db.state.upsert({
      where: { countryId_name: { countryId: india.id, name: s.state } },
      update: {},
      create: { name: s.state, countryId: india.id },
    });
    stateCount++;
    for (const d of s.districts) {
      await db.district.upsert({
        where: { stateId_name: { stateId: state.id, name: d } },
        update: {},
        create: { name: d, stateId: state.id },
      });
      districtCount++;
    }
  }
  console.log(`  India geo: ${stateCount} states, ${districtCount} districts.`);
}

async function main() {
  console.log("Seeding RBAC baseline…");
  const { superAdminRole } = await seedRbac();
  console.log("Bootstrapping Super Admin…");
  await seedSuperAdmin(superAdminRole.id);
  console.log("Seeding admission lookups…");
  await seedLookups();
  console.log("Seeding India geo (states & districts)…");
  await seedIndiaGeo();
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
