// Documents step — a grid of upload slots (photo, signature, ID proofs, mark
// sheets, certificates). Each slot uploads immediately on file select (files go
// to Cloudinary; we store the URL). Optional: none are required. Uploads need
// Cloudinary configured — until then the API returns a clear "not set up" error
// which surfaces on the slot.
"use client";

import { useRef, useState } from "react";
import { Check, FileText, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDeleteDocument, useUploadDocument } from "@/features/students/hooks/use-students";
import type { DocumentType, StudentDetail } from "@/features/students/types";

// The upload slots, grouped for a scannable layout.
const GROUPS: { title: string; slots: { type: DocumentType; label: string }[] }[] = [
  {
    title: "Identity",
    slots: [
      { type: "PHOTO", label: "Photo" },
      { type: "SIGNATURE", label: "Signature" },
      { type: "AADHAAR", label: "Aadhaar" },
      { type: "PAN", label: "PAN" },
    ],
  },
  {
    title: "Academic",
    slots: [
      { type: "TENTH", label: "10th marksheet" },
      { type: "ELEVENTH", label: "11th marksheet" },
      { type: "TWELFTH", label: "12th marksheet" },
      { type: "INTER", label: "Inter memo" },
      { type: "TC", label: "Transfer certificate" },
      { type: "EAMCET", label: "EAMCET / entrance" },
      { type: "RANK_CARD", label: "Rank card" },
    ],
  },
  {
    title: "Certificates",
    slots: [
      { type: "BIRTH_CERTIFICATE", label: "Birth certificate" },
      { type: "COMMUNITY_CERTIFICATE", label: "Community certificate" },
      { type: "INCOME_CERTIFICATE", label: "Income certificate" },
      { type: "FIRST_GRADUATE_CERTIFICATE", label: "First-graduate certificate" },
    ],
  },
];

const ACCEPT = ".jpg,.jpeg,.png,.svg,.pdf";

export function DocumentsStep({
  studentId,
  student,
}: {
  studentId: string;
  student: StudentDetail | undefined;
}) {
  const byType = new Map((student?.documents ?? []).map((d) => [d.docType, d]));

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">
        Upload JPG, PNG, SVG or PDF (max 5&nbsp;MB each). Files are optional — add what’s available.
      </p>
      {GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
            {group.title}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.slots.map((slot) => (
              <DocumentSlot
                key={slot.type}
                studentId={studentId}
                docType={slot.type}
                label={slot.label}
                fileName={byType.get(slot.type)?.fileName ?? null}
                url={byType.get(slot.type)?.url ?? null}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DocumentSlot({
  studentId,
  docType,
  label,
  fileName,
  url,
}: {
  studentId: string;
  docType: DocumentType;
  label: string;
  fileName: string | null;
  url: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDocument(studentId);
  const remove = useDeleteDocument(studentId);
  const [error, setError] = useState<string | null>(null);
  const uploaded = !!url;

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    upload.mutate(
      { docType, file },
      { onError: (e) => setError(e instanceof Error ? e.message : "Upload failed.") },
    );
    if (inputRef.current) inputRef.current.value = ""; // allow re-picking same file
  }

  const busy = upload.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-md ${
            uploaded ? "bg-status-present/15 text-status-present-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : uploaded ? (
            <Check className="size-4" />
          ) : (
            <FileText className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {uploaded ? fileName ?? "Uploaded" : "Not uploaded"}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          {uploaded ? "Replace" : "Upload"}
        </Button>
        {uploaded && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => remove.mutate(docType)}
          >
            <X className="size-4" />
            Remove
          </Button>
        )}
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
