// End-to-end check of the substitute-cover feature against the RUNNING dev server.
//
// Drives the real HTTP API with a real Firebase ID token, so it exercises
// authenticate() -> authorize() -> the route, exactly as the browser does.
//
// TEST DB ONLY (guard-env), and it CLEANS UP: every substitution it creates is
// deleted at the end. It never writes attendance.
import { assertTestEnv } from "./guard-env.js";

assertTestEnv();

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "../src/generated/prisma/client.js";

neonConfig.webSocketConstructor = ws;

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = "test-admin@jeppiaar.local";
const ADMIN_PASSWORD = "TestAdmin@2026";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: (process.env.DIRECT_URL ?? "").replace(/([?&])channel_binding=require&?/, "$1") }),
});

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

/** Sign in with email+password against Firebase's REST API for an ID token. */
async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = (await res.json()) as { idToken?: string; error?: { message?: string } };
  if (!body.idToken) throw new Error(`sign-in failed for ${email}: ${body.error?.message}`);
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
    /* non-JSON error page */
  }
  return { status: res.status, body: json as Record<string, unknown> | null, text };
}

const created: string[] = []; // substitution ids to clean up

try {
  if (!API_KEY) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is not set");

  console.log(`\nTarget: ${BASE}\n`);
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("Signed in as test-admin.\n");

  // --- Find a class + date that actually has periods -------------------------
  const semester = await db.semester.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!semester) throw new Error("no active semester");

  const slot = await db.timetableSlot.findFirst({
    where: { semesterId: semester.id },
    select: { id: true, classId: true, period: true, dayOfWeek: true, facultyId: true },
  });
  if (!slot) throw new Error("no timetable slots to test against");

  // Pick the next date matching this slot's weekday, so the day really runs it.
  const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const target = new Date();
  target.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 14 && DOW[target.getUTCDay()] !== slot.dayOfWeek; i++) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  const dateStr = target.toISOString().slice(0, 10);
  console.log(`Class ${slot.classId}, period ${slot.period} (${slot.dayOfWeek}), date ${dateStr}\n`);

  // A substitute: an active staff user in the same program who is NOT the slot teacher.
  const klass = await db.class.findUnique({
    where: { id: slot.classId },
    select: { programId: true },
  });
  const sub = await db.user.findFirst({
    where: {
      programId: klass?.programId,
      status: "ACTIVE",
      student: null,
      id: { not: slot.facultyId },
      facultyProfile: { isNot: null },
    },
    select: { id: true, displayName: true },
  });
  if (!sub) throw new Error("no candidate substitute found");
  console.log(`Substitute candidate: ${sub.displayName}\n`);

  // --- 1. GET the cover view -------------------------------------------------
  console.log("1. GET /api/attendance/substitutions");
  const view = await api(admin, `/api/attendance/substitutions?classId=${slot.classId}&date=${dateStr}`);
  check("returns 200", view.status === 200, `got ${view.status} ${view.text.slice(0, 120)}`);
  const periods = (view.body?.periods ?? []) as Array<Record<string, unknown>>;
  check("lists the day's periods", periods.length > 0, `got ${periods.length}`);
  check("each period starts with no cover", periods.every((p) => p.substitution === null));

  // --- 2. Assign cover -------------------------------------------------------
  console.log("\n2. POST — assign cover");
  const assign = await api(admin, "/api/attendance/substitutions", {
    method: "POST",
    body: JSON.stringify({
      slotId: slot.id,
      date: dateStr,
      substituteId: sub.id,
      reason: "e2e test",
    }),
  });
  check("returns 200", assign.status === 200, `got ${assign.status} ${assign.text.slice(0, 160)}`);
  if (assign.body?.id) created.push(assign.body.id as string);
  check("names the substitute", assign.body?.substituteName === sub.displayName);

  // --- 3. The cover shows up on re-read --------------------------------------
  console.log("\n3. GET again — cover is visible");
  const view2 = await api(admin, `/api/attendance/substitutions?classId=${slot.classId}&date=${dateStr}`);
  const covered = ((view2.body?.periods ?? []) as Array<Record<string, unknown>>).find(
    (p) => p.slotId === slot.id,
  );
  const subst = covered?.substitution as Record<string, unknown> | null | undefined;
  check("the period now reports a substitution", !!subst);
  check("with the right substitute", subst?.substituteId === sub.id);
  check("and records who assigned it", typeof subst?.assignedByName === "string");

  // --- 4. The marking screen reflects it -------------------------------------
  console.log("\n4. GET /api/attendance — the marking view");
  const roster = await api(admin, `/api/attendance?classId=${slot.classId}&date=${dateStr}`);
  check("returns 200", roster.status === 200, `got ${roster.status} ${roster.text.slice(0, 120)}`);
  const mp = ((roster.body?.periods ?? []) as Array<Record<string, unknown>>).find(
    (p) => p.period === slot.period,
  );
  const coveredBy = mp?.coveredBy as Record<string, unknown> | null | undefined;
  check("exposes coveredBy on the covered period", !!coveredBy);
  check("naming the substitute", coveredBy?.facultyName === sub.displayName);

  // --- 5. THE KEY NEGATIVE: admin still cannot mark it ------------------------
  console.log("\n5. The rule that matters — assigning does NOT grant marking");
  check(
    "Super Admin's canMark is false on a hour they neither teach nor cover",
    mp?.canMark === false,
    `canMark=${mp?.canMark}`,
  );
  // Must send a REAL entry: the route validates the body before it checks
  // permission, so an empty entries[] would 400 out and never reach the 403.
  const anyStudent = await db.enrollment.findFirst({
    where: { classId: slot.classId, academicYear: { isActive: true } },
    select: { studentId: true },
  });
  const badMark = await api(admin, "/api/attendance", {
    method: "POST",
    body: JSON.stringify({
      classId: slot.classId,
      date: dateStr,
      period: slot.period,
      entries: anyStudent ? [{ studentId: anyStudent.studentId, status: "PRESENT" }] : [],
    }),
  });
  check(
    "POST /api/attendance is refused 403",
    badMark.status === 403,
    `got ${badMark.status} ${badMark.text.slice(0, 120)}`,
  );

  // --- 6. Validation --------------------------------------------------------
  console.log("\n6. Validation");
  const selfAssign = await api(admin, "/api/attendance/substitutions", {
    method: "POST",
    body: JSON.stringify({ slotId: slot.id, date: dateStr, substituteId: slot.facultyId }),
  });
  check("refuses assigning the period's own teacher", selfAssign.status === 400, `got ${selfAssign.status}`);

  const student = await db.student.findFirst({ select: { userId: true } });
  if (student) {
    const studentSub = await api(admin, "/api/attendance/substitutions", {
      method: "POST",
      body: JSON.stringify({ slotId: slot.id, date: dateStr, substituteId: student.userId }),
    });
    check("refuses a student as substitute", studentSub.status === 400, `got ${studentSub.status}`);
  }

  // A date that isn't this slot's weekday (a Sunday).
  const sunday = new Date(target);
  while (sunday.getUTCDay() !== 0) sunday.setUTCDate(sunday.getUTCDate() + 1);
  const wrongDay = await api(admin, "/api/attendance/substitutions", {
    method: "POST",
    body: JSON.stringify({
      slotId: slot.id,
      date: sunday.toISOString().slice(0, 10),
      substituteId: sub.id,
    }),
  });
  check("refuses a date the period doesn't run", wrongDay.status === 400, `got ${wrongDay.status}`);

  // --- 7. Reassign replaces, not stacks --------------------------------------
  console.log("\n7. Reassigning replaces the existing cover");
  const before = await db.slotSubstitution.count({ where: { slotId: slot.id } });
  const other = await db.user.findFirst({
    where: {
      programId: klass?.programId,
      status: "ACTIVE",
      student: null,
      id: { notIn: [slot.facultyId, sub.id] },
      facultyProfile: { isNot: null },
    },
    select: { id: true },
  });
  if (other) {
    const re = await api(admin, "/api/attendance/substitutions", {
      method: "POST",
      body: JSON.stringify({ slotId: slot.id, date: dateStr, substituteId: other.id }),
    });
    if (re.body?.id) created.push(re.body.id as string);
    const after = await db.slotSubstitution.count({ where: { slotId: slot.id } });
    check("still one row for this slot (upsert, not insert)", after === before, `${before} -> ${after}`);
  }

  // --- 8. Remove --------------------------------------------------------------
  console.log("\n8. DELETE — remove cover");
  const del = await api(admin, `/api/attendance/substitutions?slotId=${slot.id}&date=${dateStr}`, {
    method: "DELETE",
  });
  check("returns 200", del.status === 200, `got ${del.status}`);
  const gone = await db.slotSubstitution.findFirst({ where: { slotId: slot.id, date: target } });
  check("the row is gone", gone === null);
} catch (e) {
  fail++;
  console.log(`\nERROR: ${(e as Error).message}`);
} finally {
  // Clean up anything left behind, so the test leaves no trace.
  if (created.length) {
    await db.slotSubstitution.deleteMany({ where: { id: { in: created } } });
  }
  console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
