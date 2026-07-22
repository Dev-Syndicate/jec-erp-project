// One-off: reset the test-admin Firebase password to a known value and clear
// mustChangePassword so it stays usable for browser testing (CLAUDE.md: use
// test-admin@jeppiaar.local, never the owner's real admin). Runs outside Next
// via tsx, so it builds its own clients like prisma/seed.ts does.
import "dotenv/config";

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "../src/generated/prisma/client.js";

neonConfig.webSocketConstructor = ws;
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

const EMAIL = "test-admin@jeppiaar.local";
const NEW_PASSWORD = "TestAdmin@2026";

const adapter = new PrismaNeon({ connectionString: requireEnv("DIRECT_URL") });
const db = new PrismaClient({ adapter });

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: requireEnv("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: requireEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: requireEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
const adminAuth = getAuth(app);

async function main() {
  const fbUser = await adminAuth.getUserByEmail(EMAIL);
  await adminAuth.updateUser(fbUser.uid, { password: NEW_PASSWORD });

  const updated = await db.user.updateMany({
    where: { firebaseUid: fbUser.uid },
    data: { mustChangePassword: false },
  });

  console.log(`Reset Firebase password for ${EMAIL} (uid ${fbUser.uid}).`);
  console.log(`Cleared mustChangePassword on ${updated.count} Neon user row(s).`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
