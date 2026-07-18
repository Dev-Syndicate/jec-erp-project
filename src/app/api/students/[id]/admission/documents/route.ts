// Documents step — upload / remove a student's document slots.
//
//   POST   multipart/form-data { file, docType } → upload to Cloudinary, upsert row
//   DELETE ?docType=…                            → remove that slot
//
// One file per (student, docType); re-uploading a slot replaces it. Files live in
// Cloudinary (never the DB) — we store only the secure URL + slot. The step is
// OPTIONAL: a student can be saved with no documents.
//
// Cloudinary must be configured (.env) for uploads to work; until then POST
// returns a clear "uploads not set up yet" message rather than a cryptic error.
//
// Authorization: Super Admin (any dept) or HOD (own dept only).
import { authenticate, requireRole, assertDeptScope, toAuthResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCloudinaryConfigured, uploadToCloudinary } from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

const DOC_TYPES = [
  "PHOTO", "SIGNATURE", "AADHAAR", "PAN", "TENTH", "ELEVENTH", "TWELFTH", "INTER",
  "TC", "EAMCET", "RANK_CARD", "BIRTH_CERTIFICATE", "COMMUNITY_CERTIFICATE",
  "INCOME_CERTIFICATE", "FIRST_GRADUATE_CERTIFICATE",
] as const;
type DocType = (typeof DOC_TYPES)[number];

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/svg+xml", "application/pdf",
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

async function loadStudent(req: Request, id: string) {
  const ctx = await authenticate(req);
  requireRole(ctx, "Super Admin", "HOD");
  const student = await db.student.findUnique({ where: { id }, include: { user: true } });
  if (!student) return { error: Response.json({ error: "Student not found." }, { status: 404 }) };
  assertDeptScope(ctx, student.user.departmentId);
  return { student };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { student, error } = await loadStudent(req, id);
    if (error) return error;

    if (!isCloudinaryConfigured()) {
      return Response.json(
        { error: "Document uploads aren’t set up yet — Cloudinary credentials are missing." },
        { status: 503 },
      );
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const docType = form?.get("docType");
    if (!(file instanceof File) || typeof docType !== "string") {
      return Response.json({ error: "A file and a docType are required." }, { status: 400 });
    }
    if (!DOC_TYPES.includes(docType as DocType)) {
      return Response.json({ error: "Unknown document type." }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return Response.json({ error: "Only JPG, PNG, SVG or PDF files are accepted." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "File is too large (max 5 MB)." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const resourceType = file.type === "application/pdf" ? "raw" : "image";
    const uploaded = await uploadToCloudinary(bytes, {
      folder: `jec-erp/students/${student!.id}`,
      publicId: docType.toLowerCase(),
      resourceType,
    });

    const doc = await db.studentDocument.upsert({
      where: { studentId_docType: { studentId: id, docType: docType as DocType } },
      update: { url: uploaded.url, fileName: file.name },
      create: { studentId: id, docType: docType as DocType, url: uploaded.url, fileName: file.name },
    });

    return Response.json({ ok: true, document: doc });
  } catch (err) {
    return toAuthResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await loadStudent(req, id);
    if (error) return error;

    const docType = new URL(req.url).searchParams.get("docType");
    if (!docType || !DOC_TYPES.includes(docType as DocType)) {
      return Response.json({ error: "A valid docType query param is required." }, { status: 400 });
    }

    // Row + Cloudinary asset are independent; deleting the row is enough for the
    // UI. (Cloudinary cleanup can be added later via deleteFromCloudinary.)
    await db.studentDocument.deleteMany({ where: { studentId: id, docType: docType as DocType } });
    return Response.json({ ok: true });
  } catch (err) {
    return toAuthResponse(err);
  }
}
