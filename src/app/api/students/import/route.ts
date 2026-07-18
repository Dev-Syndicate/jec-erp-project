// POST /api/students/import — bulk-provision students from a CSV/Excel upload.
//
// multipart/form-data { file, departmentId }. The department is chosen once in
// the UI (not a column); every row joins it. We parse + validate, provision each
// valid row (shared helper — same path as the single form), save an ImportBatch
// recording what happened, and return per-row outcomes incl. temp passwords.
//
// Authorization: Super Admin (any dept) or HOD (own dept only). See
// docs/bulk-student-import.md.
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  MAX_IMPORT_ROWS,
  parseStudentSheet,
  provisionRows,
  type ImportOutcome,
} from "@/lib/student-import";

export const dynamic = "force-dynamic";

const ACCEPT_MIME = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream", // some browsers send this for .csv/.xlsx
]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// GET /api/students/import — list past import batches (newest first), dept-scoped.
// Powers the batch history + "regenerate & re-download" list.
export async function GET(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const where = ctx.roles.includes("Super Admin")
      ? {}
      : { departmentId: ctx.user.departmentId ?? "__none__" };

    const batches = await db.importBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        department: { select: { name: true, code: true } },
        createdBy: { select: { displayName: true } },
      },
    });

    return Response.json({
      batches: batches.map((b) => ({
        id: b.id,
        fileName: b.fileName,
        department: { name: b.department.name, code: b.department.code },
        createdBy: b.createdBy.displayName,
        totalRows: b.totalRows,
        createdCount: b.createdCount,
        skippedCount: b.skippedCount,
        errorCount: b.errorCount,
        createdAt: b.createdAt,
      })),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin", "HOD");

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const departmentIdRaw = form?.get("departmentId");
    if (!(file instanceof File)) {
      return Response.json({ error: "A CSV or Excel file is required." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: "File is too large (max 5 MB)." }, { status: 400 });
    }
    // Accept by extension too — MIME types for spreadsheets are inconsistent.
    const okExt = /\.(csv|xlsx|xls)$/i.test(file.name);
    if (!ACCEPT_MIME.has(file.type) && !okExt) {
      return Response.json({ error: "Only CSV or Excel (.csv, .xlsx) files are accepted." }, { status: 400 });
    }

    // Super Admin may target any department; HOD is pinned to their own.
    const departmentId = ctx.roles.includes("Super Admin")
      ? (typeof departmentIdRaw === "string" ? departmentIdRaw : "")
      : ctx.user.departmentId ?? "";
    if (!departmentId) {
      return Response.json({ error: "Choose a department for the import." }, { status: 400 });
    }
    assertDeptScope(ctx, departmentId);

    const dept = await db.department.findUnique({ where: { id: departmentId } });
    if (!dept || !dept.isActive) {
      return Response.json({ error: "Unknown or inactive department." }, { status: 400 });
    }

    const roleRow = await db.role.findUnique({ where: { name: "Student" } });
    if (!roleRow) throw new Error('Role "Student" is not seeded.');

    // --- parse ------------------------------------------------------------
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseStudentSheet(buffer);

    if (parsed.rows.length === 0 && parsed.errors.length === 0) {
      return Response.json(
        { error: "No student rows found. Check the file has the expected header row and data." },
        { status: 400 },
      );
    }

    // --- provision valid rows --------------------------------------------
    const outcomes = await provisionRows(parsed.rows, {
      departmentId,
      roleId: roleRow.id,
    });

    // Merge parse-time errors (which never reached provisioning) into results.
    const parseErrorOutcomes: ImportOutcome[] = parsed.errors.map((e) => ({
      rowNumber: e.rowNumber,
      registerNumber: e.registerNumber,
      rollNumber: "",
      name: "",
      email: "",
      status: "error",
      reason: e.reason,
    }));
    const allOutcomes = [...outcomes, ...parseErrorOutcomes].sort(
      (a, b) => a.rowNumber - b.rowNumber,
    );

    const createdCount = outcomes.filter((o) => o.status === "created").length;
    const skippedCount = outcomes.filter((o) => o.status === "skipped").length;
    const errorCount = allOutcomes.filter((o) => o.status === "error").length;

    // --- record the batch (never stores passwords) ------------------------
    const batch = await db.importBatch.create({
      data: {
        createdById: ctx.user.id,
        departmentId,
        fileName: file.name,
        totalRows: allOutcomes.length,
        createdCount,
        skippedCount,
        errorCount,
        members: {
          create: allOutcomes.map((o) => ({
            studentId: o.studentId ?? null,
            registerNumber: o.registerNumber,
            status: o.status,
            reason: o.reason ?? null,
          })),
        },
      },
    });

    // Audit the import as one action.
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: "student.bulkImport",
        entity: "ImportBatch",
        entityId: batch.id,
        after: { departmentId, createdCount, skippedCount, errorCount, fileName: file.name },
      },
    });

    return Response.json({
      batchId: batch.id,
      department: { id: dept.id, name: dept.name, code: dept.code },
      totalRows: allOutcomes.length,
      createdCount,
      skippedCount,
      errorCount,
      tooManyRows: parsed.tooManyRows,
      maxRows: MAX_IMPORT_ROWS,
      // Full results incl. temp passwords for created rows — the ONLY time
      // they're revealed. The client offers a download and a results table.
      results: allOutcomes.map((o) => ({
        rowNumber: o.rowNumber,
        name: o.name,
        email: o.email,
        registerNumber: o.registerNumber,
        rollNumber: o.rollNumber,
        status: o.status,
        reason: o.reason ?? null,
        tempPassword: o.tempPassword ?? null,
      })),
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
