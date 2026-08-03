// The highest-consequence path: a SUBSTITUTE marking PERIOD 1.
//
// Period 1 doesn't just record the hour — it upserts that student's
// MasterAttendance, the official day record that drives overall %. So a
// substitute marking period 1 writes the day record for the whole class. This
// checks that it works, that the day record is actually written, and that the
// audit trail names the substitute.
//
// TEST DB ONLY. Cleans up both PeriodAttendance and MasterAttendance it writes.
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
function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail++;
    console.log(`  GAP   ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function tokenFor(uid: string) {
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

let madeSub: string | null = null;
let wrote: { classId: string; date: Date } | null = null;

try {
  const semester = await db.semester.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!semester) throw new Error("no active semester");

  const slot = await db.timetableSlot.findFirst({
    where: {
      semesterId: semester.id,
      period: 1,
      class: { enrollments: { some: { academicYear: { isActive: true } } } },
    },
    select: { id: true, classId: true, dayOfWeek: true, facultyId: true },
  });
  if (!slot) throw new Error("no period-1 slot with students");

  const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 14 && DOW[d.getUTCDay()] !== slot.dayOfWeek; i++) d.setUTCDate(d.getUTCDate() + 1);
  const dateStr = d.toISOString().slice(0, 10);

  // Only run on a date with no existing day record, so cleanup can't destroy
  // real data.
  const preexisting = await db.masterAttendance.count({ where: { classId: slot.classId, date: d } });
  if (preexisting > 0) throw new Error(`refusing to run: ${preexisting} MasterAttendance rows already exist for ${dateStr}`);

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
    take: 3,
  });
  const entries = students.map((s, i) => ({
    studentId: s.studentId,
    // Mix statuses so the day record has something meaningful to carry.
    status: i === 0 ? "ABSENT" : "PRESENT",
  }));

  console.log(`\nPeriod 1, ${slot.dayOfWeek} ${dateStr}, class ${slot.classId.slice(-6)}`);
  console.log(`Substitute: ${sub.displayName}\n`);

  const row = await db.slotSubstitution.create({
    data: { slotId: slot.id, date: d, substituteId: sub.id, assignedById: sub.id, reason: "p1 test" },
    select: { id: true },
  });
  madeSub = row.id;

  const token = await tokenFor(sub.firebaseUid);
  const marked = await api(token, "/api/attendance", {
    method: "POST",
    body: JSON.stringify({ classId: slot.classId, date: dateStr, period: 1, entries }),
  });
  check("substitute can mark PERIOD 1", marked.status === 200, `got ${marked.status} ${marked.text.slice(0, 140)}`);
  if (marked.status === 200) wrote = { classId: slot.classId, date: d };

  check("response reports it set the day attendance", marked.body?.setDayAttendance === true);

  const master = await db.masterAttendance.findMany({
    where: { classId: slot.classId, date: d },
    select: { studentId: true, status: true, markedById: true },
  });
  check("MasterAttendance rows were created", master.length === entries.length, `${master.length} of ${entries.length}`);
  check(
    "the day record mirrors the period statuses",
    master.every((m) => entries.find((e) => e.studentId === m.studentId)?.status === m.status),
  );
  check(
    "day record credits the SUBSTITUTE as marker",
    master.every((m) => m.markedById === sub.id),
  );
} catch (e) {
  fail++;
  console.log(`\nERROR: ${(e as Error).message}`);
} finally {
  if (wrote) {
    await db.periodAttendance.deleteMany({ where: { classId: wrote.classId, date: wrote.date, period: 1 } });
    await db.masterAttendance.deleteMany({ where: { classId: wrote.classId, date: wrote.date } });
  }
  if (madeSub) await db.slotSubstitution.deleteMany({ where: { id: madeSub } });
  console.log(`\n${"=".repeat(46)}\n  ${pass} ok, ${fail} gaps\n${"=".repeat(46)}`);
  await db.$disconnect();
  process.exit(0);
}
