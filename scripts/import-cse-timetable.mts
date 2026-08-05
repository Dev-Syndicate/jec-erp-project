// Import the college's CSE timetable spreadsheet ("CSE TT VERSION 4.xlsx").
//
// DRY RUN BY DEFAULT. Pass --commit to actually write. The dry run reports every
// slot it would create, every cell it skipped and why, and every name it could
// not resolve — writing nothing.
//
// WHAT THE SHEET LOOKS LIKE, and the three things that make it non-obvious:
//
//   1. LUNCH MOVES. Nine columns are labelled 1..9, but one of them is the lunch
//      break — and it is NOT the same column for every year. Year 2 and Year 4
//      take lunch at 12.00-12.45 (label 6); Year 3 teaches through that hour and
//      takes lunch at 12.45-01.30 (label 7). The label is written once on Monday
//      and merged down the week, so it looks blank on Tue-Fri. Detected per sheet
//      from the Monday row; hardcoding it would silently delete 15 real Year-3
//      classes. Every sheet then yields exactly 8 teaching periods, which is what
//      TimetableSlot.period allows.
//
//   2. "CS25C08 LAB" is the SAME course as "CS25C08" — a practical hour, not a
//      different subject. Recorded as TimetableSlot.isLab so one Subject covers
//      the whole course (see that field's comment for why splitting is wrong).
//
//   3. Faculty names are written differently from the DB ("Ms. T.MONISHA" vs
//      "Monisha T"). Resolved by normalising both to a surname + initials set;
//      anything ambiguous is REPORTED, never guessed — a wrong match would hand
//      one teacher's hours, and the right to sign their register, to another.
//
// TEST DB ONLY (guard-env).
const { config } = await import("dotenv");
config({ path: ".env" });

const { assertTestEnv } = await import("./guard-env.js");
assertTestEnv("import-cse-timetable.mts");

const { readFileSync } = await import("node:fs");
const XLSX = await import("xlsx");
const { PrismaNeon } = await import("@prisma/adapter-neon");
const { neonConfig } = await import("@neondatabase/serverless");
const { default: ws } = await import("ws");
const { PrismaClient } = await import("../src/generated/prisma/client.js");

neonConfig.webSocketConstructor = ws;

const db = new PrismaClient({
  adapter: new PrismaNeon({
    connectionString: (process.env.DIRECT_URL ?? "").replace(/([?&])channel_binding=require&?/, "$1"),
  }),
});

const COMMIT = process.argv.includes("--commit");
const FILE = "CSE TT VERSION 4.xlsx";

type Day = "MON" | "TUE" | "WED" | "THU" | "FRI";
const DAYS: Day[] = ["MON", "TUE", "WED", "THU", "FRI"];

// The 9 labelled columns, in sheet order. One of them is lunch (detected below).
const LABEL_COLS = [1, 2, 3, 5, 7, 11, 15, 16, 17];

// Scheduled hours that are not a taught subject. They occupy a cell but have no
// course code and no teacher, so no slot can be written for them.
const NON_TEACHING = /^(lunch\s*break|tea\s*break|library|aptitude|sdc\s*-?\s*1|skill\s*development.*)$/i;

// Sheet name -> the class it describes. The sheet's own "Year/Sem" header is
// inconsistent (II Year C says AY 2025-26 while the rest say 2026-27), so the
// mapping is explicit rather than parsed.
const SHEET_TO_CLASS: Record<string, { year: number; section: string }> = {
  "Final Year A": { year: 4, section: "A" },
  "Final Year B": { year: 4, section: "B" },
  "III Year A": { year: 3, section: "A" },
  "III Year B": { year: 3, section: "B" },
  "III Year C": { year: 3, section: "C" },
  "II Year A": { year: 2, section: "A" },
  "II Year B": { year: 2, section: "B" },
  "II Year C": { year: 2, section: "C" },
};

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/**
 * Reduce a name to { surname, initials } so the sheet's "Ms. T.MONISHA" and the
 * DB's "Monisha T" compare equal.
 *
 * Strips titles and the trailing ", AP / CSE" designation. Everything of length 1
 * is an initial; the longest remaining token is taken as the surname — which is
 * what distinguishes people here, since initials collide constantly.
 */
function nameKey(raw: string): { surname: string; initials: Set<string>; joined: string } {
  let s = raw.toUpperCase();
  s = s.split(",")[0]; // drop ", AP / CSE"
  s = s.replace(/\b(DR|MR|MRS|MS|PROF|AP|ASP|HOD)\b\.?/g, " ");
  s = s.replace(/[^A-Z ]/g, " "); // dots between initials become spaces
  const tokens = s.split(/\s+/).filter(Boolean);
  const initials = new Set(tokens.filter((t) => t.length === 1));
  const words = tokens.filter((t) => t.length > 1);
  // Longest word = the surname. "SHERYL CATHERINE" -> CATHERINE.
  const surname = words.sort((a, b) => b.length - a.length)[0] ?? "";
  // ...but a name can be written as one word or two: the sheet has "NITHIYA
  // PRIYA" where the DB has "Nithyapriya". Keeping the concatenation of all the
  // words lets those compare equal; on a single-word name it just equals the
  // surname, so it costs nothing.
  const joined = words.slice().sort().join("");
  return { surname, initials, joined };
}

type StaffRow = { userId: string; displayName: string; deptCode: string; key: ReturnType<typeof nameKey> };

/** Resolve a sheet name to a DB user. Returns null when it is not unambiguous. */
function resolveStaff(raw: string, staff: StaffRow[]): { hit: StaffRow | null; note: string } {
  const k = nameKey(raw);
  if (!k.surname) return { hit: null, note: "no surname parsed" };

  // Exact surname match first.
  let cands = staff.filter((s) => s.key.surname === k.surname);

  // Then the one-word-vs-two case: "NITHIYA PRIYA" (sheet) vs "Nithyapriya" (DB).
  // Compared with a small edit-distance tolerance because the two spellings also
  // differ (NITHIYA/NITHYA).
  if (cands.length === 0) {
    cands = staff.filter(
      (s) => s.key.joined.length >= 6 && levenshtein(s.key.joined, k.joined) <= 2,
    );
  }

  // Then a containment match, for spelling drift (JAGADHEESAN vs JAGADEESAN,
  // THRIPURAM vs THIRIPURAM, NIRWIN vs NIRVIN).
  if (cands.length === 0) {
    cands = staff.filter(
      (s) =>
        s.key.surname.length >= 4 &&
        (s.key.surname.includes(k.surname) ||
          k.surname.includes(s.key.surname) ||
          levenshtein(s.key.surname, k.surname) <= 2),
    );
  }

  if (cands.length === 0) return { hit: null, note: "no match" };
  if (cands.length === 1) return { hit: cands[0], note: "" };

  // Several share a surname — break the tie on initials.
  const byInitial = cands.filter((s) => [...k.initials].some((i) => s.key.initials.has(i)));
  if (byInitial.length === 1) return { hit: byInitial[0], note: "matched on initial" };

  return { hit: null, note: `ambiguous: ${cands.map((c) => c.displayName).join(" / ")}` };
}

function levenshtein(a: string, b: string): number {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

type Planned = {
  sheet: string;
  classId: string;
  classLabel: string;
  day: Day;
  period: number;
  subjectId: string;
  subjectCode: string;
  facultyUserId: string;
  facultyName: string;
  facultyDept: string;
  isLab: boolean;
};

// Cells REMOVED from the imported grid — the only departures from the sheet.
//
// Y4-B Friday P8: the sheet double-books Ms. M. Arshiya Mobeen there — Y4-B
// OME354 and Y2-A CS25C08, two rooms at once. That is an error in the source,
// not the parse: both class sheets independently name her. Left EMPTY rather
// than reassigned, because every plausible replacement is itself busy that hour
// (Ruthra, the obvious candidate, is supervising Y4-A's internship then) and
// inventing an assignment the college never made would be worse than a visible
// hole. They reschedule it and we re-import.
//
// Recorded here rather than hand-deleted from the DB so a re-import reproduces
// the decision instead of silently restoring the clash.
const REMOVALS: Array<{
  year: number; section: string; day: Day; period: number; why: string;
}> = [
  {
    year: 4, section: "B", day: "FRI", period: 8,
    why: "sheet double-books Arshiya Mobeen (also Y2-A CS25C08 at this hour)",
  },
];
type Skipped = { sheet: string; day: Day; label: number; text: string; why: string };

async function main() {
  console.log(COMMIT ? "*** COMMIT MODE — this WILL write ***\n" : "DRY RUN — nothing will be written.\n");

  const semester = await db.semester.findFirst({
    where: { isActive: true },
    include: { academicYear: true },
  });
  if (!semester) throw new Error("No active semester. Activate one first.");
  console.log(`Active semester: ${semester.academicYear.name} ${semester.kind}\n`);

  const classes = await db.class.findMany({
    include: { program: { include: { degree: true, branch: true } } },
  });
  const subjects = await db.subject.findMany({ select: { id: true, code: true, programId: true } });
  const staffRows = await db.facultyProfile.findMany({
    select: {
      userId: true, staffId: true,
      department: { select: { code: true } },
      user: { select: { displayName: true } },
    },
  });
  const staff: StaffRow[] = staffRows.map((s) => ({
    userId: s.userId,
    displayName: s.user.displayName,
    deptCode: s.department.code,
    key: nameKey(s.user.displayName),
  }));

  const wb = XLSX.read(readFileSync(FILE), { type: "buffer", cellDates: true });

  const planned: Planned[] = [];
  const skipped: Skipped[] = [];
  const unresolved = new Map<string, string>(); // raw name -> why
  const usedSubjects = new Set<string>();

  for (const [sheetName, target] of Object.entries(SHEET_TO_CLASS)) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) { console.log(`  ! sheet "${sheetName}" not found`); continue; }

    const klass = classes.find((c) => c.year === target.year && c.section === target.section);
    if (!klass) { console.log(`  ! no DB class for ${sheetName} (Y${target.year}-${target.section})`); continue; }
    const classLabel = `${klass.program.degree.code}·${klass.program.branch.code} Y${klass.year}-${klass.section}`;

    const g = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: false, defval: "" });
    const dayRows = g.filter((r) => DAYS.includes(clean((r as unknown[])[0]).toUpperCase() as Day)) as unknown[][];

    // --- which labelled column is lunch, on THIS sheet? ---------------------
    const monday = dayRows[0];
    const lunchIdx = LABEL_COLS.findIndex((c) => /lunch/i.test(clean(monday[c])));
    if (lunchIdx === -1) { console.log(`  ! ${sheetName}: no lunch column found`); continue; }
    const teachingCols = LABEL_COLS.filter((_, i) => i !== lunchIdx);

    // --- the course table: code -> faculty name ----------------------------
    const codeHdr = g.findIndex((r) => (r as unknown[]).some((c) => /course\s*code/i.test(clean(c))));
    const facultyForCode = new Map<string, string>();
    if (codeHdr >= 0) {
      for (const r of g.slice(codeHdr + 1)) {
        const cells = (r as unknown[]).map(clean);
        const code = cells[1];
        if (!code) continue;
        // The faculty column is the first non-empty cell from index 15 on.
        const fac = cells.slice(15).find(Boolean) ?? "";
        if (fac) facultyForCode.set(code.toUpperCase(), fac);
      }
    }

    // --- the grid -----------------------------------------------------------
    for (const row of dayRows) {
      const day = clean(row[0]).toUpperCase() as Day;
      teachingCols.forEach((col, i) => {
        const period = i + 1;
        const raw = clean(row[col]);
        const label = LABEL_COLS.indexOf(col) + 1;
        if (!raw) { skipped.push({ sheet: sheetName, day, label, text: "(empty)", why: "no entry" }); return; }
        if (NON_TEACHING.test(raw)) {
          skipped.push({ sheet: sheetName, day, label, text: raw, why: "not a taught subject" });
          return;
        }

        // "CS25C08 LAB" / "CS3591(LAB)" -> code + lab flag.
        const isLab = /\bLAB\b|\(LAB\)/i.test(raw);
        const code = raw.replace(/\(?\bLAB\b\)?/i, "").trim().toUpperCase();

        const subject = subjects.find((s) => s.code.toUpperCase() === code && s.programId === klass.programId);
        if (!subject) {
          skipped.push({ sheet: sheetName, day, label, text: raw, why: `no Subject "${code}" in this program` });
          return;
        }
        usedSubjects.add(code);

        const facRaw = facultyForCode.get(code);
        if (!facRaw) {
          skipped.push({ sheet: sheetName, day, label, text: raw, why: `no faculty listed for ${code}` });
          return;
        }
        const { hit, note } = resolveStaff(facRaw, staff);
        if (!hit) {
          unresolved.set(facRaw, note);
          skipped.push({ sheet: sheetName, day, label, text: raw, why: `unresolved faculty "${facRaw}" (${note})` });
          return;
        }

        planned.push({
          sheet: sheetName, classId: klass.id, classLabel, day, period,
          subjectId: subject.id, subjectCode: subject.code,
          facultyUserId: hit.userId, facultyName: hit.displayName, facultyDept: hit.deptCode,
          isLab,
        });
      });
    }
  }

  // --- the Summer internship supervision grid -------------------------------
  // A separate sheet, laid out by SUPERVISOR rather than by hour: one row per
  // member of staff, two blocks of Mon-Fri (Final Year A, then Final Year B),
  // and the cell holds the PERIOD LABEL they take. So it is the transpose of a
  // class timetable and has to be read on its own terms.
  //
  // These are the CS3711 hours the class sheets leave blank — their course table
  // names no faculty for the internship because it is supervised per student.
  const internSheet = wb.Sheets["Project Internship"];
  if (internSheet) {
    const g = XLSX.utils.sheet_to_json<unknown[]>(internSheet, { header: 1, blankrows: false, raw: false, defval: "" });
    const hdrIdx = g.findIndex((r) => (r as unknown[]).some((c) => /^monday$/i.test(clean(c))));

    if (hdrIdx === -1) {
      console.log("  ! internship sheet: no weekday header found, skipped\n");
    } else {
      const hdr = (g[hdrIdx] as unknown[]).map(clean);
      // Ten day columns in sheet order: the first five are Final Year A, the
      // next five Final Year B.
      const dayCols: Array<{ idx: number; day: Day }> = [];
      hdr.forEach((c, i) => {
        const m = /^(monday|tuesday|wednesday|thursday|friday)$/i.exec(c);
        if (m) dayCols.push({ idx: i, day: m[1].slice(0, 3).toUpperCase() as Day });
      });

      // Final Year sheets take lunch at label 6, so labels 1-5 are periods 1-5
      // and labels 7,8,9 are periods 6,7,8.
      const labelToPeriod = (l: number) => (l <= 5 ? l : l - 1);

      for (const r of g.slice(hdrIdx + 1)) {
        const cells = (r as unknown[]).map(clean);
        const rawName = cells[1];
        if (!rawName || /coordinator|hod|principal/i.test(rawName)) continue;

        const { hit, note } = resolveStaff(rawName, staff);
        if (!hit) { unresolved.set(rawName, `${note} (internship sheet)`); continue; }

        dayCols.forEach((dc, n) => {
          const v = cells[dc.idx];
          if (!v) return;
          const label = Number(v);
          if (!Number.isInteger(label) || label < 1 || label > 9) return;

          const section = n < 5 ? "A" : "B";
          const klass = classes.find((c) => c.year === 4 && c.section === section);
          if (!klass) return;
          const subject = subjects.find((s) => s.code.toUpperCase() === "CS3711" && s.programId === klass.programId);
          if (!subject) return;

          const period = labelToPeriod(label);
          // Never overwrite a taught hour: if the class sheet already put a
          // subject here, the supervision grid disagrees with it and that is
          // worth reporting rather than silently resolving.
          const taken = planned.find((p) => p.classId === klass.id && p.day === dc.day && p.period === period);
          if (taken) {
            skipped.push({
              sheet: "Project Internship", day: dc.day, label,
              text: `CS3711 ${hit.displayName}`,
              why: `Y4-${section} ${dc.day} P${period} already holds ${taken.subjectCode}`,
            });
            return;
          }

          planned.push({
            sheet: "Project Internship", classId: klass.id,
            classLabel: `${klass.program.degree.code}·${klass.program.branch.code} Y4-${section}`,
            day: dc.day, period, subjectId: subject.id, subjectCode: subject.code,
            facultyUserId: hit.userId, facultyName: hit.displayName, facultyDept: hit.deptCode,
            isLab: false,
          });
        });
      }
    }
  }

  // --- removals --------------------------------------------------------------
  for (const o of REMOVALS) {
    const klass = classes.find((c) => c.year === o.year && c.section === o.section);
    if (!klass) continue;
    const idx = planned.findIndex((p) => p.classId === klass.id && p.day === o.day && p.period === o.period);
    if (idx === -1) {
      console.log(`REMOVAL   Y${o.year}-${o.section} ${o.day} P${o.period}: already empty\n`);
      continue;
    }
    const gone = planned[idx];
    planned.splice(idx, 1);
    console.log(`REMOVAL   Y${o.year}-${o.section} ${o.day} P${o.period}: dropped ${gone.subjectCode}/${gone.facultyName}`);
    console.log(`          ${o.why}`);
    console.log(`          left EMPTY — for the college to reschedule\n`);
  }

  // --- clash detection -------------------------------------------------------
  // The DB's unique key is (class, day, period) — it cannot see one teacher
  // being placed in two classes at the same hour, so check for it here.
  const byTeacherHour = new Map<string, Planned[]>();
  for (const p of planned) {
    const k = `${p.facultyUserId}|${p.day}|${p.period}`;
    byTeacherHour.set(k, [...(byTeacherHour.get(k) ?? []), p]);
  }
  const clashes = [...byTeacherHour.values()].filter((v) => v.length > 1);
  if (clashes.length) {
    console.log("!! TEACHER DOUBLE-BOOKED — one person, two classes, same hour:");
    for (const c of clashes) {
      console.log(`   ${c[0].facultyName}  ${c[0].day} P${c[0].period}:  ${c.map((x) => `${x.classLabel} ${x.subjectCode}`).join("  ×  ")}`);
    }
    console.log();
  } else {
    console.log("No teacher is double-booked.\n");
  }

  // --- report --------------------------------------------------------------
  console.log("PLANNED SLOTS BY CLASS:");
  const byClass = new Map<string, Planned[]>();
  for (const p of planned) byClass.set(p.classLabel, [...(byClass.get(p.classLabel) ?? []), p]);
  for (const [label, ps] of [...byClass.entries()].sort()) {
    const labs = ps.filter((p) => p.isLab).length;
    console.log(`  ${label.padEnd(18)} ${String(ps.length).padStart(2)} slots (${labs} lab)`);
  }
  console.log(`  TOTAL: ${planned.length} slots\n`);

  // Cross-department teaching — needs an attachment or the write is refused.
  const cross = planned.filter((p) => p.facultyDept !== "CSE");
  if (cross.length) {
    console.log("CROSS-DEPARTMENT TEACHING (needs an attachment):");
    const seen = new Map<string, { name: string; dept: string; n: number }>();
    for (const c of cross) {
      const e = seen.get(c.facultyUserId) ?? { name: c.facultyName, dept: c.facultyDept, n: 0 };
      e.n++; seen.set(c.facultyUserId, e);
    }
    for (const [, v] of seen) console.log(`  ${v.name} (${v.dept}) — ${v.n} periods in CSE classes`);
    console.log();
  }

  const bySkip = new Map<string, number>();
  for (const s of skipped) if (s.why !== "no entry") bySkip.set(s.why, (bySkip.get(s.why) ?? 0) + 1);
  console.log("SKIPPED (excluding empty cells):");
  for (const [why, n] of [...bySkip.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)} × ${why}`);
  if (bySkip.size === 0) console.log("  none");
  console.log();

  if (unresolved.size) {
    console.log("UNRESOLVED FACULTY NAMES — these periods cannot be imported:");
    for (const [raw, why] of unresolved) console.log(`  "${raw}" — ${why}`);
    console.log();
  }

  const existingSlots = await db.timetableSlot.count();
  const existingAttendance = await db.periodAttendance.count();
  const existingMaster = await db.masterAttendance.count();
  console.log(`WOULD DELETE: ${existingSlots} slots, ${existingAttendance} period-attendance, ${existingMaster} day-attendance`);
  console.log(`WOULD CREATE: ${planned.length} slots\n`);

  if (!COMMIT) {
    console.log("Dry run complete. Re-run with --commit to apply.");
    return;
  }

  // --- write ---------------------------------------------------------------
  // Attendance first: PeriodAttendance references subjects/semesters that the
  // rebuilt grid may no longer line up with, and the user asked for a clean slate.
  await db.$transaction(async (tx) => {
    await tx.periodAttendance.deleteMany({});
    await tx.masterAttendance.deleteMany({});
    await tx.slotSubstitution.deleteMany({});
    await tx.timetableSlot.deleteMany({});
    await tx.timetableSlot.createMany({
      data: planned.map((p) => ({
        classId: p.classId,
        semesterId: semester.id,
        dayOfWeek: p.day,
        period: p.period,
        subjectId: p.subjectId,
        facultyId: p.facultyUserId,
        isLab: p.isLab,
      })),
    });
  }, { timeout: 30000 });

  // Cross-department staff need an attachment for this semester or the app will
  // refuse to edit their cells (and, before the fix, to mark their attendance).
  const attachDept = new Map<string, string>();
  for (const c of cross) attachDept.set(c.facultyUserId, c.facultyDept);
  let attached = 0;
  for (const [userId] of attachDept) {
    const profile = await db.facultyProfile.findFirst({ where: { userId }, select: { id: true } });
    const cseDept = await db.department.findUnique({ where: { code: "CSE" }, select: { id: true } });
    if (!profile || !cseDept) continue;
    const admin = await db.user.findFirst({ where: { roles: { some: { role: { name: "Super Admin" } } } }, select: { id: true } });
    if (!admin) continue;
    await db.facultyAttachment.upsert({
      where: { facultyId_departmentId_semesterId: { facultyId: profile.id, departmentId: cseDept.id, semesterId: semester.id } },
      create: { facultyId: profile.id, departmentId: cseDept.id, semesterId: semester.id, assignedById: admin.id, reason: "Timetable import (CSE TT VERSION 4)" },
      update: {},
    });
    attached++;
  }

  const now = await db.timetableSlot.count();
  console.log(`DONE. ${now} slots in the database. ${attached} cross-department attachments created.`);
}

try {
  await main();
} finally {
  await db.$disconnect();
}
