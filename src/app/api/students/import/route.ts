// POST /api/students/import — bulk-provision students from a CSV/Excel upload.
// Super-Admin only, program-scoped. Multipart body: `file`, `programId`, and an
// optional `dryRun` flag.
//
//   dryRun=true  → parse + validate only; returns { rows, errors, tooManyRows }
//                  so the admin sees what's valid BEFORE any account is created.
//   (commit)     → parse, then provision each valid row into the program; returns
//                  per-row outcomes (created/skipped/error) with temp passwords.
//
// The parse + provision logic lives in src/lib/student-import.ts; this route only
// handles auth, the upload, and the program/role lookups.
import { authenticate, assertProgramScope, requireRole, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseStudentSheet, provisionRows } from "@/lib/student-import";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    requireRole(ctx, "Super Admin");

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ error: "Expected a file upload." }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof Blob)) return Response.json({ error: "No file uploaded." }, { status: 400 });

    const programId = String(form.get("programId") ?? "").trim();
    if (!programId) return Response.json({ error: "Choose a program for the import." }, { status: 400 });
    assertProgramScope(ctx, programId);

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseStudentSheet(buffer);

    // Dry run: return the parse result for the preview step, provision nothing.
    if (String(form.get("dryRun") ?? "") === "true") {
      return Response.json(parsed);
    }

    // Commit: needs a valid program + the seeded Student role.
    const program = await db.program.findUnique({ where: { id: programId }, select: { id: true } });
    if (!program) return Response.json({ error: "Select a valid program." }, { status: 400 });

    const studentRole = await db.role.findUnique({ where: { name: "Student" }, select: { id: true } });
    if (!studentRole) {
      return Response.json({ error: "Student role is not seeded. Run the seed." }, { status: 500 });
    }

    const outcomes = await provisionRows(parsed.rows, { programId, roleId: studentRole.id });

    return Response.json({
      outcomes,
      parseErrors: parsed.errors,
      tooManyRows: parsed.tooManyRows,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
