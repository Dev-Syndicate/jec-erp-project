// Diagnose the "grid was editable but Save 403'd" report.
// Read-only: asks the API what canMark it reports for each period, per user.
import { assertTestEnv } from "./guard-env.js";

assertTestEnv("diag-canmark.mts");

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { PrismaClient } from "../src/generated/prisma/client.js";

neonConfig.webSocketConstructor = ws;

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const req = (n: string) => {
  const v = process.env[n];
  if (!v) throw new Error(`${n} not set`);
  return v;
};

const db = new PrismaClient({
  adapter: new PrismaNeon({
    connectionString: (process.env.DIRECT_URL ?? "").replace(/([?&])channel_binding=require&?/, "$1"),
  }),
});

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: req("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: req("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: req("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });

async function tokenFor(uid: string) {
  const custom = await getAuth(app).createCustomToken(uid);
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    },
  );
  const b = (await r.json()) as { idToken?: string };
  if (!b.idToken) throw new Error("token exchange failed");
  return b.idToken;
}

const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const dateStr = process.env.DIAG_DATE ?? today.toISOString().slice(0, 10);

const sem = await db.semester.findFirst({ where: { isActive: true }, select: { id: true } });

// Every class that has periods on this date's weekday.
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const weekday = DOW[new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()];
console.log(`\nDate ${dateStr} is a ${weekday}\n`);

// Who to impersonate: the Super Admin, plus one ordinary faculty.
const admin = await db.user.findFirst({
  where: { roles: { some: { role: { name: "Super Admin" } } }, status: "ACTIVE" },
  select: { id: true, firebaseUid: true, displayName: true },
});
const faculty = await db.user.findFirst({
  where: { status: "ACTIVE", facultyProfile: { isNot: null }, timetableSlots: { some: { semesterId: sem!.id } } },
  select: { id: true, firebaseUid: true, displayName: true },
});

const klass = await db.class.findFirst({
  where: { timetableSlots: { some: { semesterId: sem!.id, dayOfWeek: weekday as never } } },
  select: { id: true, year: true, section: true },
});
if (!klass) {
  console.log("No class has periods on this weekday — nothing to diagnose.");
  await db.$disconnect();
  process.exit(0);
}
console.log(`Class ${klass.year}-${klass.section} (${klass.id.slice(-6)})\n`);

for (const who of [admin, faculty]) {
  if (!who) continue;
  const token = await tokenFor(who.firebaseUid);
  const res = await fetch(`${BASE}/api/attendance?classId=${klass.id}&date=${dateStr}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as Record<string, unknown>;
  console.log(`--- as ${who.displayName} (HTTP ${res.status}) ---`);
  if (res.status !== 200) {
    console.log("   ", JSON.stringify(body).slice(0, 160));
    continue;
  }
  const periods = (body.periods ?? []) as Array<Record<string, unknown>>;
  if (periods.length === 0) console.log("    (no periods scheduled)");
  for (const p of periods) {
    const cover = p.coveredBy as Record<string, unknown> | null;
    console.log(
      `    P${p.period} ${String(p.subjectCode).padEnd(10)} teacher=${String(p.facultyName).padEnd(20)}` +
        ` canMark=${String(p.canMark).padEnd(5)}` +
        (cover ? ` COVERED by ${cover.facultyName}` : ""),
    );
  }
  console.log("");
}

await db.$disconnect();
