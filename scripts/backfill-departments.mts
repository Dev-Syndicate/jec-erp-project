// One-shot backfill for slice 1 of docs/plan-department-model.md.
//
// Creates a Department per existing Branch (plus S&H, which has no Branch by
// definition), then points every Program, Class and FacultyProfile at one.
//
// Idempotent: re-running finds the departments already created and the rows
// already linked, and does nothing. Safe to run twice.
//
// TEST DB ONLY (guard-env). It writes NOTHING outside the three departmentId
// columns and the Department table itself.
//
// NOTE: this script is DELETABLE once the columns are flipped to required —
// at that point `where: { departmentId: null }` stops type-checking, so a
// migration script that queries for the un-backfilled state cannot coexist with
// the schema it migrates to. (That is exactly what happened to the previous
// attempt's backfill; recorded here so it isn't a surprise.)
import { assertTestEnv } from "./guard-env.js";

assertTestEnv("backfill-departments.mts");

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "../src/generated/prisma/client.js";

neonConfig.webSocketConstructor = ws;

const db = new PrismaClient({
  adapter: new PrismaNeon({
    connectionString: (process.env.DIRECT_URL ?? "").replace(/([?&])channel_binding=require&?/, "$1"),
  }),
});

const DRY = process.argv.includes("--dry-run");

// A department that is not a discipline — it owns first-year classes across every
// branch and employs the staff who teach them, but runs no award of its own.
const TEACHING_ONLY = [{ code: "S&H", name: "Science and Humanities Department" }];

function log(...args: unknown[]) {
  console.log(...args);
}

try {
  log(DRY ? "\n=== DRY RUN — nothing will be written ===\n" : "\n=== BACKFILL ===\n");

  // --- 1. A Department per Branch ------------------------------------------
  // The branch is the discipline; the department is the unit that runs it. For an
  // existing single-branch department the two line up 1:1, which is exactly the
  // state we're migrating FROM. A department spanning several branches (Civil
  // running B.E-CIVIL + B.E-STRUCT) is set up by hand afterwards — it cannot be
  // derived, because nothing in today's data records that grouping.
  const allBranches = await db.branch.findMany({
    select: { id: true, code: true, name: true, _count: { select: { programs: true } } },
  });
  log(`Branches found: ${allBranches.map((b) => b.code).join(", ")}`);

  // A Branch with NO programs is not a discipline anyone graduates in — under the
  // new model it should never have been a Branch at all. (S&H is exactly this: a
  // leftover from the reverted Branch-as-department attempt.) Such a branch becomes
  // a Department via TEACHING_ONLY below, and the stale Branch row is reported for
  // manual deletion rather than removed here — this script only backfills.
  const branches = allBranches.filter((b) => b._count.programs > 0);
  const stale = allBranches.filter((b) => b._count.programs === 0);
  if (stale.length) {
    log(`  (skipping ${stale.map((b) => b.code).join(", ")} — branch with no programs)`);
  }

  const deptByCode = new Map<string, string>();
  for (const b of branches) {
    const existing = await db.department.findUnique({ where: { code: b.code }, select: { id: true } });
    if (existing) {
      deptByCode.set(b.code, existing.id);
      log(`  = ${b.code} department already exists`);
      continue;
    }
    if (DRY) {
      // Register a placeholder id so the later steps can be reported accurately —
      // without it every downstream lookup misses and the dry run reports a
      // misleading "no department, skipped" for every row.
      deptByCode.set(b.code, `<new:${b.code}>`);
      log(`  + would create department ${b.code} — "${b.name} Department"`);
      continue;
    }
    const created = await db.department.create({
      data: { code: b.code, name: `${b.name} Department` },
      select: { id: true },
    });
    deptByCode.set(b.code, created.id);
    log(`  + created department ${b.code}`);
  }

  for (const t of TEACHING_ONLY) {
    const existing = await db.department.findUnique({ where: { code: t.code }, select: { id: true } });
    if (existing) {
      deptByCode.set(t.code, existing.id);
      log(`  = ${t.code} department already exists`);
      continue;
    }
    if (DRY) {
      deptByCode.set(t.code, `<new:${t.code}>`);
      log(`  + would create teaching-only department ${t.code}`);
      continue;
    }
    const created = await db.department.create({ data: t, select: { id: true } });
    deptByCode.set(t.code, created.id);
    log(`  + created teaching-only department ${t.code}`);
  }

  // --- 2. Program -> the department matching its branch ----------------------
  const programs = await db.program.findMany({
    where: { departmentId: null },
    select: { id: true, branch: { select: { code: true } }, degree: { select: { code: true } } },
  });
  log(`\nPrograms needing a department: ${programs.length}`);
  for (const p of programs) {
    const deptId = deptByCode.get(p.branch.code);
    if (!deptId) {
      log(`  ! ${p.degree.code}·${p.branch.code} — NO department for branch ${p.branch.code}, skipped`);
      continue;
    }
    if (DRY) {
      log(`  + would link ${p.degree.code}·${p.branch.code} -> ${p.branch.code} department`);
      continue;
    }
    await db.program.update({ where: { id: p.id }, data: { departmentId: deptId } });
    log(`  + ${p.degree.code}·${p.branch.code} -> ${p.branch.code} department`);
  }

  // --- 3. Class -> its program's department ---------------------------------
  // Every existing class is year 2+ real data or an empty year-1 shell, so the
  // owner is simply the branch's own department. First-year classes owned by S&H
  // are created later, through the UI — this backfill does NOT invent them.
  const classes = await db.class.findMany({
    where: { departmentId: null },
    select: {
      id: true,
      year: true,
      section: true,
      program: { select: { branch: { select: { code: true } } } },
    },
  });
  log(`\nClasses needing an owner: ${classes.length}`);
  let classLinked = 0;
  for (const c of classes) {
    const deptId = deptByCode.get(c.program.branch.code);
    if (!deptId) {
      log(`  ! Y${c.year}-${c.section} — no department, skipped`);
      continue;
    }
    if (!DRY) await db.class.update({ where: { id: c.id }, data: { departmentId: deptId } });
    classLinked++;
  }
  log(`  ${DRY ? "would link" : "linked"} ${classLinked} class(es)`);

  // --- 4. FacultyProfile -> the department of their user's program -----------
  // Employment previously had no home of its own; the best available signal is
  // the program the user was scoped to. Anyone without one cannot be derived and
  // is REPORTED rather than guessed.
  const faculty = await db.facultyProfile.findMany({
    where: { departmentId: null },
    select: {
      id: true,
      staffId: true,
      user: {
        select: {
          displayName: true,
          program: { select: { branch: { select: { code: true } } } },
        },
      },
    },
  });
  log(`\nFaculty needing a department: ${faculty.length}`);
  let facultyLinked = 0;
  const orphans: string[] = [];
  for (const f of faculty) {
    const code = f.user.program?.branch.code;
    const deptId = code ? deptByCode.get(code) : undefined;
    if (!deptId) {
      orphans.push(`${f.staffId} (${f.user.displayName})`);
      continue;
    }
    if (!DRY) await db.facultyProfile.update({ where: { id: f.id }, data: { departmentId: deptId } });
    facultyLinked++;
  }
  log(`  ${DRY ? "would link" : "linked"} ${facultyLinked} faculty`);
  if (orphans.length) {
    log(`\n  ⚠ ${orphans.length} faculty have NO program to derive a department from.`);
    log(`    Assign these by hand before making departmentId required:`);
    for (const o of orphans) log(`      - ${o}`);
  }

  // --- 5. Report -------------------------------------------------------------
  log("\n=== Remaining nulls (must be 0 before flipping to required) ===");
  log("  programs:", await db.program.count({ where: { departmentId: null } }));
  log("  classes :", await db.class.count({ where: { departmentId: null } }));
  log("  faculty :", await db.facultyProfile.count({ where: { departmentId: null } }));

  if (stale.length) {
    log("\n=== Stale Branch rows ===");
    log("  These branches have no programs, so under the new model they are");
    log("  departments, not disciplines. Their Department now exists; the leftover");
    log("  Branch row should be deleted by hand once nothing references it:");
    for (const b of stale) log(`    - ${b.code} (${b.name})`);
  }
  log(DRY ? "\n(dry run — nothing was written)\n" : "\nDone.\n");
} catch (err) {
  console.error("\nBACKFILL FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
