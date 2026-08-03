// The other half of the cover test: does the ASSIGNED SUBSTITUTE actually get to
// mark the hour — and only that hour?
//
// Signs in as the substitute WITHOUT touching their password: Firebase Admin
// mints a custom token, which is exchanged for an ID token. Nobody's credentials
// change.
//
// TEST DB ONLY (guard-env). Cleans up: deletes the substitution it creates AND
// any attendance rows it writes.
import { assertTestEnv } from "./guard-env.js";

assertTestEnv("e2e-cover-mark.mts");

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { PrismaClient } from "../src/generated/prisma/client.js";

neonConfig.webSocketConstructor = ws;

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

const db = new PrismaClient({
  adapter: new PrismaNeon({
    connectionString: (process.env.DIRECT_URL ?? "").replace(/([?&])channel_binding=require&?/, "$1"),
  }),
});

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

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** An ID token for a uid, minted via Admin — no password involved. */
async function tokenFor(firebaseUid: string): Promise<string> {
  const custom = await adminAuth.createCustomToken(firebaseUid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    },
  );
  const body = (await res.json()) as { idToken?: string; error?: { message?: string } };
  if (!body.idToken) throw new Error(`token exchange failed: ${body.error?.message}`);
  return body.idToken;
}

async function api(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
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

let subId: string | null = null;
let wroteFor: { classId: string; date: Date; period: number } | null = null;

try {
  if (!API_KEY) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is not set");

  const semester = await db.semester.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!semester) throw new Error("no active semester");

  // A slot whose class has students, so marking is meaningful. Prefer period > 1
  // so the test never touches MasterAttendance (period 1 seeds the day record).
  const slot = await db.timetableSlot.findFirst({
    where: {
      semesterId: semester.id,
      period: { gt: 1 },
      class: { enrollments: { some: { academicYear: { isActive: true } } } },
    },
    select: { id: true, classId: true, period: true, dayOfWeek: true, facultyId: true },
  });
  if (!slot) throw new Error("no suitable slot (period > 1 with enrolled students)");

  const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const target = new Date();
  target.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 14 && DOW[target.getUTCDay()] !== slot.dayOfWeek; i++) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  const dateStr = target.toISOString().slice(0, 10);

  const klass = await db.class.findUnique({
    where: { id: slot.classId },
    select: { programId: true },
  });

  // The substitute: active staff in the program, not this slot's teacher.
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
  if (!sub) throw new Error("no candidate substitute");

  // Another slot the substitute neither teaches nor covers — the negative case.
  const otherSlot = await db.timetableSlot.findFirst({
    where: {
      semesterId: semester.id,
      classId: slot.classId,
      dayOfWeek: slot.dayOfWeek,
      period: { gt: 1, not: slot.period },
      facultyId: { not: sub.id },
    },
    select: { period: true },
  });

  console.log(`\nSlot: class ${slot.classId}, period ${slot.period} (${slot.dayOfWeek}), ${dateStr}`);
  console.log(`Substitute: ${sub.displayName}\n`);

  const students = await db.enrollment.findMany({
    where: { classId: slot.classId, academicYear: { isActive: true } },
    select: { studentId: true },
    take: 3,
  });

  const subToken = await tokenFor(sub.firebaseUid);

  // --- 1. BEFORE cover: the substitute must be refused ------------------------
  console.log("1. Before any cover is arranged");
  const before = await api(subToken, "/api/attendance", {
    method: "POST",
    body: JSON.stringify({
      classId: slot.classId,
      date: dateStr,
      period: slot.period,
      entries: students.map((s) => ({ studentId: s.studentId, status: "PRESENT" })),
    }),
  });
  check("substitute cannot mark it yet", before.status === 403, `got ${before.status}`);

  // --- 2. Assign the cover directly (the API path is already covered) ---------
  // upsert, not create — a leftover row from an interrupted run would otherwise
  // trip the (slotId, date) unique constraint.
  const row = await db.slotSubstitution.upsert({
    where: { slotId_date: { slotId: slot.id, date: target } },
    create: {
      slotId: slot.id,
      date: target,
      substituteId: sub.id,
      assignedById: sub.id, // audit field; not what grants the right
      reason: "e2e mark test",
    },
    update: { substituteId: sub.id, assignedById: sub.id, reason: "e2e mark test" },
    select: { id: true },
  });
  subId = row.id;
  console.log("\n2. Cover assigned.");

  // --- 3. AFTER cover: the substitute may now mark ----------------------------
  console.log("\n3. After cover is arranged");
  const view = await api(subToken, `/api/attendance?classId=${slot.classId}&date=${dateStr}`);
  check("substitute can now load the class", view.status === 200, `got ${view.status}`);
  const periods = (view.body?.periods ?? []) as Array<Record<string, unknown>>;
  const mine = periods.find((p) => p.period === slot.period);
  check("their covered period reports canMark=true", mine?.canMark === true, `canMark=${mine?.canMark}`);

  if (otherSlot) {
    const notMine = periods.find((p) => p.period === otherSlot.period);
    check(
      "a period they do NOT cover stays locked",
      notMine?.canMark === false,
      `period ${otherSlot.period} canMark=${notMine?.canMark}`,
    );
  }

  const marked = await api(subToken, "/api/attendance", {
    method: "POST",
    body: JSON.stringify({
      classId: slot.classId,
      date: dateStr,
      period: slot.period,
      entries: students.map((s) => ({ studentId: s.studentId, status: "PRESENT" })),
    }),
  });
  check("substitute CAN mark the covered hour", marked.status === 200, `got ${marked.status} ${marked.text.slice(0, 140)}`);
  if (marked.status === 200) {
    wroteFor = { classId: slot.classId, date: target, period: slot.period };
  }

  // --- 4. The record names who actually marked -------------------------------
  console.log("\n4. Audit trail");
  const saved = await db.periodAttendance.findFirst({
    where: { classId: slot.classId, date: target, period: slot.period },
    select: { markedById: true },
  });
  check("markedById is the SUBSTITUTE, not the regular teacher", saved?.markedById === sub.id);

  // --- 5. Marking a period they don't cover is still refused ------------------
  if (otherSlot) {
    console.log("\n5. The grant is per period");
    const other = await api(subToken, "/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        classId: slot.classId,
        date: dateStr,
        period: otherSlot.period,
        entries: students.map((s) => ({ studentId: s.studentId, status: "PRESENT" })),
      }),
    });
    check("cannot mark an uncovered period", other.status === 403, `got ${other.status}`);
  }
} catch (e) {
  fail++;
  console.log(`\nERROR: ${(e as Error).message}`);
} finally {
  // Undo everything this test wrote.
  if (wroteFor) {
    await db.periodAttendance.deleteMany({
      where: { classId: wroteFor.classId, date: wroteFor.date, period: wroteFor.period },
    });
  }
  if (subId) await db.slotSubstitution.deleteMany({ where: { id: subId } });
  console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
