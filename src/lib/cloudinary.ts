// Cloudinary — server-side media uploads (student documents).
//
// Images/PDFs live in Cloudinary, never in Neon (CLAUDE.md: keep the DB small,
// keep images in Cloudinary). We store only the returned secure URL on the
// StudentDocument row. This is server-only: the API secret must never reach a
// client.
//
// The credentials are placeholders until filled in .env — isConfigured() lets
// callers surface a clear "uploads not set up yet" message instead of throwing
// a cryptic SDK error.
import "server-only";

import { v2 as cloudinary } from "cloudinary";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

export function isCloudinaryConfigured(): boolean {
  return Boolean(cloudName && apiKey && apiSecret);
}

let configured = false;
function ensureConfigured() {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.",
    );
  }
  if (!configured) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    configured = true;
  }
}

export type UploadResult = { url: string; publicId: string; bytes: number; format: string };

/**
 * Upload a file (image or PDF) to Cloudinary under the given folder and return
 * its secure URL. `data` is the raw bytes; `resourceType` is "image" for
 * jpg/png/svg and "raw" for pdf (Cloudinary treats PDFs as either — "auto" lets
 * it decide).
 */
export async function uploadToCloudinary(
  data: Buffer,
  opts: { folder: string; publicId?: string; resourceType?: "image" | "raw" | "auto" },
): Promise<UploadResult> {
  ensureConfigured();
  return new Promise<UploadResult>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: opts.folder,
        public_id: opts.publicId,
        resource_type: opts.resourceType ?? "auto",
        overwrite: true,
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed."));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
          format: result.format,
        });
      },
    );
    stream.end(data);
  });
}

/** Remove a previously uploaded file (e.g. when a document slot is replaced). */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId);
}
