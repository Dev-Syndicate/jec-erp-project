// Edge cases for substitute cover. Probing for real gaps, not re-testing the
// happy path. TEST DB ONLY; cleans up everything it writes.
import { assertTestEnv } from "./guard-env.js";

assertTestEnv();

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
const adminAuth = getAuth(app);

let pass = 0;
let fail = 0;
const issues: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail++;
    issues.push(`${label}${detail ? ` (${detail})` : ""}`);
    console.log(`  GAP   ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function tokenFor(uid: string): Promise<string> {
  const custom = await adminAuth.createCustomToken(uid);
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

async function api(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, body: json as Record<string, unknown> | null, text };
}

const madeSubs: string[] = [];
const wroteAttendance: Array<{ classId: string; date: Date; period: number }> = [];

try {
  const semester = await db.semester.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!semester) throw new Error("no active semester");

  const slot = await db.timetableSlot.findFirst({
    where: {
      semesterId: semester.id,
      period: { gt: 1 },
      class: { enrollments: { some: { academicYear: { isActive: true } } } },
    },
    select: { id: true, classId: true, period: true, dayOfWeek: true, facultyId: true },
  });
  if (!slot) throw new Error("no suitable slot");

  const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const d1 = new Date();
  d1.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 14 && DOW[d1.getUTCDay()] !== slot.dayOfWeek; i++) {
    d1.setUTCDate(d1.getUTCDate() + 1);
  }
  const date1 = d1.toISOString().slice(0, 10);

  // The SAME weekday next week — for the "cover is dated" test.
  const d2 = new Date(d1);
  d2.setUTCDate(d2.getUTCDate() + 7);
  const date2 = d2.toISOString().slice(0, 10);

  const klass = await db.class.findUnique({ where: { id: slot.classId }, select: { programId: true } });
  const sub = await db.user.findFirst({
    where: {
      programId: klass?.programId,
      status: "ACTIVE",
      student: null,
      id: { not: slot.facultyId },
      facultyProfile: { isNot: null },
    },
    select: { id: true, firebaseUid: true, displayName: true },
  });
  if (!sub) throw new Error("no substitute candidate");

  const students = await db.enrollment.findMany({
    where: { classId: slot.classId, academicYear: { isActive: true } },
    select: { studentId: true },
    take: 2,
  });
  const entries = students.map((s) => ({ studentId: s.studentId, status: "PRESENT" }));
  const subToken = await tokenFor(sub.firebaseUid);

  console.log(`\nSlot: period ${slot.period} ${slot.dayOfWeek}; dates ${date1} / ${date2}`);
  console.log(`Substitute: ${sub.displayName}\n`);

  // Cover on date1 ONLY.
  const row = await db.slotSubstitution.upsert({
    where: { slotId_date: { slotId: slot.id, date: d1 } },
    create: { slotId: slot.id, date: d1, substituteId: sub.id, assignedById: sub.id },
    update: { substituteId: sub.id },
    select: { id: true },
  });
  madeSubs.push(row.id);

  // === EDGE 1: is the grant really limited to that DATE? =====================
  console.log("EDGE 1 — cover is dated, not permanent");
  const nextWeek = await api(subToken, "/api/attendance", {
    method: "POST",
    body: JSON.stringify({ classId: slot.classId, date: date2, period: slot.period, entries }),
  });
  check(
    "same period NEXT WEEK is refused (cover was for one date)",
    nextWeek.status === 403,
    `got ${nextWeek.status}`,
  );

  // === EDGE 2: revoking cover after marking ==================================
  console.log("\nEDGE 2 — cover revoked after the substitute already marked");
  const marked = await api(subToken, "/api/attendance", {
    method: "POST",
    body: JSON.stringify({ classId: slot.classId, date: date1, period: slot.period, entries }),
  });
  if (marked.status === 200) wroteAttendance.push({ classId: slot.classId, date: d1, period: slot.period });
  check("substitute marks the covered hour", marked.status === 200, `got ${marked.status}`);

  await db.slotSubstitution.deleteMany({ where: { id: row.id } });
  const rowsAfterRevoke = await db.periodAttendance.count({
    where: { classId: slot.classId, date: d1, period: slot.period },
  });
  check("attendance SURVIVES the cover being removed", rowsAfterRevoke > 0, `${rowsAfterRevoke} rows`);

  const reMark = await api(subToken, "/api/attendance", {
    method: "POST",
    body: JSON.stringify({ classId: slot.classId, date: date1, period: slot.period, entries }),
  });
  check("but they can no longer EDIT it once revoked", reMark.status === 403, `got ${reMark.status}`);

  // Re-grant for the remaining tests.
  const row2 = await db.slotSubstitution.create({
    data: { slotId: slot.id, date: d1, substituteId: sub.id, assignedById: sub.id },
    select: { id: true },
  });
  madeSubs.push(row2.id);

  // === EDGE 3: deactivated substitute ========================================
  console.log("\nEDGE 3 — substitute is deactivated AFTER being assigned");
  await db.user.update({ where: { id: sub.id }, data: { status: "INACTIVE" } });
  const inactiveNow = await api(subToken, "/api/attendance", {
    method: "POST",
    body: JSON.stringify({ classId: slot.classId, date: date1, period: slot.period, entries }),
  });
  // Deactivating straight in the DB bypasses the route that calls
  // invalidateAuthUser, so authenticate()'s 30s cache can still hold the old
  // user. Distinguish "cache lag" (acceptable, documented) from "never
  // rejected" (a real hole) by waiting the TTL out and retrying.
  if (inactiveNow.status === 200) {
    wroteAttendance.push({ classId: slot.classId, date: d1, period: slot.period });
    console.log("        (200 while the 30s auth cache is warm — waiting it out…)");
    await new Promise((r) => setTimeout(r, 32_000));
  }
  const inactiveAfterTtl = await api(subToken, "/api/attendance", {
    method: "POST",
    body: JSON.stringify({ classId: slot.classId, date: date1, period: slot.period, entries }),
  });
  check(
    "a deactivated account is rejected once the auth cache expires",
    inactiveAfterTtl.status === 401 || inactiveAfterTtl.status === 403,
    `got ${inactiveAfterTtl.status}`,
  );
  await db.user.update({ where: { id: sub.id }, data: { status: "ACTIVE" } });

  // === EDGE 4: does cover leak to the DAY record? ============================
  console.log("\nEDGE 4 — cover must not grant the day record");
  const dayTry = await api(subToken, "/api/attendance/master", {
    method: "POST",
    body: JSON.stringify({ classId: slot.classId, date: date1, entries }),
  });
  check(
    "substitute cannot correct the DAY record (advisor's job)",
    dayTry.status === 403,
    `got ${dayTry.status}`,
  );

  // === EDGE 5: can a substitute assign further cover? ========================
  console.log("\nEDGE 5 — cover must not be re-grantable");
  const chain = await api(subToken, "/api/attendance/substitutions", {
    method: "POST",
    body: JSON.stringify({ slotId: slot.id, date: date2, substituteId: sub.id }),
  });
  check(
    "a plain faculty cannot assign cover at all",
    chain.status === 403,
    `got ${chain.status}`,
  );

  // === EDGE 6: cross-program isolation =======================================
  console.log("\nEDGE 6 — cross-program");
  const foreign = await db.user.findFirst({
    where: {
      status: "ACTIVE",
      student: null,
      facultyProfile: { isNot: null },
      programId: { not: klass?.programId ?? null },
    },
    select: { id: true, displayName: true },
  });
  if (foreign) {
    const admin = await db.user.findFirst({
      where: { roles: { some: { role: { name: "Super Admin" } } }, status: "ACTIVE" },
      select: { firebaseUid: true },
    });
    if (admin) {
      const adminToken = await tokenFor(admin.firebaseUid);
      const crossAssign = await api(adminToken, "/api/attendance/substitutions", {
        method: "POST",
        body: JSON.stringify({ slotId: slot.id, date: date2, substituteId: foreign.id }),
      });
      check(
        "cannot assign a teacher from another program",
        crossAssign.status === 400,
        `got ${crossAssign.status}`,
      );
    }
  } else {
    console.log("  skip  only one program in this DB — cross-program untestable");
  }

  // === EDGE 7: period 1 cover writes the day record ==========================
  console.log("\nEDGE 7 — period 1 cover seeds MasterAttendance");
  const p1 = await db.timetableSlot.findFirst({
    where: { semesterId: semester.id, classId: slot.classId, dayOfWeek: slot.dayOfWeek, period: 1 },
    select: { id: true, facultyId: true },
  });
  if (p1 && p1.facultyId !== sub.id) {
    const r3 = await db.slotSubstitution.create({
      data: { slotId: p1.id, date: d1, substituteId: sub.id, assignedById: sub.id },
      select: { id: true },
    });
    madeSubs.push(r3.id);
    const markP1 = await api(subToken, "/api/attendance", {
      method: "POST",
      body: JSON.stringify({ classId: slot.classId, date: date1, period: 1, entries }),
    });
    if (markP1.status === 200) wroteAttendance.push({ classId: slot.classId, date: d1, period: 1 });
    check("substitute can mark period 1", markP1.status === 200, `got ${markP1.status}`);
    const master = await db.masterAttendance.count({ where: { classId: slot.classId, date: d1 } });
    check("and it still seeds the day record", master > 0, `${master} master rows`);
  } else {
    console.log("  skip  no separate period-1 slot to test");
  }
} catch (e) {
  fail++;
  console.log(`\nERROR: ${(e as Error).message}`);
} finally {
  for (const w of wroteAttendance) {
    await db.periodAttendance.deleteMany({ where: { classId: w.classId, date: w.date, period: w.period } });
  }
  if (wroteAttendance.length) {
    await db.masterAttendance.deleteMany({
      where: { classId: wroteAttendance[0].classId, date: wroteAttendance[0].date },
    });
  }
  if (madeSubs.length) await db.slotSubstitution.deleteMany({ where: { id: { in: madeSubs } } });

  console.log(`\n${"=".repeat(50)}\n  ${pass} ok, ${fail} gaps`);
  if (issues.length) {
    console.log("\n  GAPS FOUND:");
    for (const i of issues) console.log(`   - ${i}`);
  }
  console.log("=".repeat(50));
  await db.$disconnect();
  process.exit(0);
}
