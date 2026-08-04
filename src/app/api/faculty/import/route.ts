// POST /api/faculty/import — bulk-provision faculty from a CSV/Excel upload.
// Department-scoped. Multipart body: `file`, `departmentId`, `roleIds` (repeated
// or comma-separated), and an optional `dryRun` flag.
//
//   dryRun=true  → parse + validate only; returns { rows, errors, tooManyRows }
//                  so the admin sees what's valid BEFORE any account is created.
//   (commit)     → parse, then provision each valid row into the department;
//                  returns per-row outcomes (created/skipped/error) with temp
//                  passwords.
//
// The parse + provision logic lives in src/lib/faculty-import.ts; this route only
// handles auth, the upload, and the department/role lookups.
//
// ROLES COME FROM THE UI, NOT THE SHEET — and go through the SAME
// validateAssignableRoles subset check the single-add route uses. A spreadsheet
// naming its own roles would be a privilege-escalation path straight around that
// rule: an HOD could otherwise import an account more powerful than their own.
import { authenticate, authorize, toAuthResponse } from "@/lib/auth";
import { parseFacultySheet, provisionRows } from "@/lib/faculty-import";
import { validateAssignableRoles, validateDepartment } from "../dto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await authenticate(req);
    authorize(ctx, "manage", "Faculty");

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ error: "Expected a file upload." }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return Response.json({ error: "No file uploaded." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseFacultySheet(buffer);

    // Dry run: return the parse result for the preview step, provision nothing.
    // Only the capability check above gates it — it reads the uploaded file and
    // touches no records, so there is nothing departmental to scope against yet.
    if (String(form.get("dryRun") ?? "") === "true") {
      return Response.json(parsed);
    }

    const departmentId = String(form.get("departmentId") ?? "").trim();
    if (!departmentId) {
      return Response.json({ error: "Choose a department for the import." }, { status: 400 });
    }

    // Can only import INTO a department you may act in — staff are scoped by who
    // employs them, so this is the department axis.
    authorize(ctx, "manage", "Faculty", { departmentId });

    const department = await validateDepartment(departmentId);
    if ("error" in department) {
      return Response.json({ error: department.error }, { status: 400 });
    }

    // roleIds arrives either as repeated form fields or one comma-separated
    // value, depending on how the client builds the FormData — accept both.
    const roleIds = [
      ...new Set(
        form
          .getAll("roleIds")
          .flatMap((v) => String(v).split(","))
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    const roles = await validateAssignableRoles(roleIds, ctx);
    if ("error" in roles) return Response.json({ error: roles.error }, { status: 400 });

    const outcomes = await provisionRows(parsed.rows, {
      departmentId,
      roleIds: roles.ok,
    });

    return Response.json({
      outcomes,
      parseErrors: parsed.errors,
      tooManyRows: parsed.tooManyRows,
    });
  } catch (err) {
    return toAuthResponse(err);
  }
}
