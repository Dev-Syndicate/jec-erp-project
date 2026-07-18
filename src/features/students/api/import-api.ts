// Client-side fetchers for bulk student import — upload, list batches, regenerate
// a batch, and single-student password regeneration. Plus CSV helpers for the
// template and results downloads (done client-side; no server round-trip needed).
"use client";

import { apiFetch } from "@/lib/api-client";
import type {
  BatchRegenResult,
  ImportBatchSummary,
  ImportResult,
} from "@/features/students/types";

export function uploadStudentSheet(file: File, departmentId: string): Promise<ImportResult> {
  const body = new FormData();
  body.append("file", file);
  body.append("departmentId", departmentId);
  return apiFetch<ImportResult>("/api/students/import", { method: "POST", body });
}

export async function listImportBatches(): Promise<ImportBatchSummary[]> {
  const { batches } = await apiFetch<{ batches: ImportBatchSummary[] }>("/api/students/import");
  return batches;
}

export function regenerateBatch(batchId: string): Promise<BatchRegenResult> {
  return apiFetch<BatchRegenResult>(`/api/students/import/${batchId}/regenerate`, {
    method: "POST",
  });
}

export function regenerateStudentPassword(studentId: string): Promise<{ ok: true; tempPassword: string }> {
  return apiFetch<{ ok: true; tempPassword: string }>(
    `/api/students/${studentId}/regenerate-password`,
    { method: "POST" },
  );
}

// --- CSV helpers (client-side) ---

const TEMPLATE_HEADERS = [
  "name",
  "email",
  "registerNumber",
  "rollNumber",
  "dateOfBirth",
  "phone",
  "gender",
];

function toCsv(rows: string[][]): string {
  const esc = (v: string) => {
    const s = v ?? "";
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

function download(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Empty template with headers + one example row. */
export function downloadImportTemplate() {
  const example = [
    "Priya R.",
    "priya.r@jeppiaar.edu.in",
    "422021104042",
    "21CS042",
    "2004-05-18",
    "+91 98765 43210",
    "FEMALE",
  ];
  download("student-import-template.csv", toCsv([TEMPLATE_HEADERS, example]));
}

/** The results file (register, roll, name, email, temp password, status, reason). */
export function downloadImportResults(
  result: {
    department: { code: string };
    results: Array<{ registerNumber: string; rollNumber: string; name: string; email: string; status: string; reason: string | null; tempPassword: string | null }>;
  },
) {
  const header = ["registerNumber", "rollNumber", "name", "email", "tempPassword", "status", "reason"];
  const rows = result.results.map((r) => [
    r.registerNumber,
    r.rollNumber,
    r.name,
    r.email,
    r.tempPassword ?? "",
    r.status,
    r.reason ?? "",
  ]);
  download(`student-import-${result.department.code}-results.csv`, toCsv([header, ...rows]));
}

/** The regenerated-passwords file from a batch re-issue. */
export function downloadRegenResults(result: BatchRegenResult) {
  const header = ["registerNumber", "name", "email", "tempPassword", "status", "reason"];
  const rows = result.results.map((r) => [
    r.registerNumber,
    r.name,
    r.email,
    r.tempPassword ?? "",
    r.status,
    r.reason ?? "",
  ]);
  download(`student-regen-${result.department.code}-results.csv`, toCsv([header, ...rows]));
}
