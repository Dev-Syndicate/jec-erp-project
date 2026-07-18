// Bulk student import — pick a department, upload a CSV/Excel sheet, provision
// everyone at once, then download the results file (roll + email + temp
// password). Past imports are listed below with a "regenerate & re-download" for
// when the results file is lost. See docs/bulk-student-import.md.
"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DepartmentSelect } from "@/features/roles/components/department-select";
import type { DepartmentOption } from "@/features/roles/types";
import {
  downloadImportResults,
  downloadImportTemplate,
  downloadRegenResults,
} from "@/features/students/api/import-api";
import {
  useImportBatches,
  useRegenerateBatch,
  useUploadStudentSheet,
} from "@/features/students/hooks/use-import";
import type {
  BatchRegenResult,
  ImportResult,
  ImportRowStatus,
} from "@/features/students/types";

export function ImportStudents({
  departments,
  lockedDepartmentId,
}: {
  departments: DepartmentOption[];
  // HODs are pinned to their own department (no picker); Super Admin chooses.
  lockedDepartmentId?: string;
}) {
  const [departmentId, setDepartmentId] = useState(lockedDepartmentId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadStudentSheet();

  const canUpload = !!departmentId && !!file && !upload.isPending;

  function submit() {
    if (!file || !departmentId) return;
    upload.mutate(
      { file, departmentId },
      {
        onSuccess: (r) => {
          setResult(r);
          setFile(null);
          if (inputRef.current) inputRef.current.value = "";
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Upload card */}
      <section className="flex flex-col gap-4 rounded-lg border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-base font-semibold text-foreground">Upload a sheet</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              CSV or Excel, up to 1000 students. Every student joins the chosen department.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={downloadImportTemplate}>
            <Download className="size-4" />
            Template
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Department</label>
            {lockedDepartmentId ? (
              <div className="flex h-10 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                {departments.find((d) => d.id === lockedDepartmentId)?.name ?? "Your department"}
              </div>
            ) : (
              <DepartmentSelect
                id="import-dept"
                value={departmentId}
                onChange={setDepartmentId}
                departments={departments}
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">File</label>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </div>

        {upload.isError && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {upload.error instanceof Error ? upload.error.message : "Import failed."}
          </p>
        )}

        <div>
          <Button onClick={submit} disabled={!canUpload}>
            <Upload className="size-4" />
            {upload.isPending ? "Importing…" : "Import students"}
          </Button>
        </div>
      </section>

      {result && <ResultPanel result={result} onDismiss={() => setResult(null)} />}

      <BatchHistory />
    </div>
  );
}

function ResultPanel({ result, onDismiss }: { result: ImportResult; onDismiss: () => void }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-accent/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-primary">
            Import complete · {result.department.name}
          </p>
          <p className="mt-1 text-sm text-foreground">
            <Count n={result.createdCount} label="created" /> ·{" "}
            <Count n={result.skippedCount} label="skipped" /> ·{" "}
            <Count n={result.errorCount} label="errors" /> of {result.totalRows} rows
          </p>
          {result.tooManyRows && (
            <p className="mt-1 text-xs text-status-od-foreground">
              Only the first {result.maxRows} rows were processed — split larger files.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => downloadImportResults(result)}>
            <Download className="size-4" />
            Download results
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>

      <p className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        The results file holds each student’s one-time password — download and distribute it now. It
        won’t be shown again, but you can regenerate it later from the imports list below.
      </p>

      <div className="overflow-x-auto rounded-md border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Register no</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.results.map((r) => (
              <TableRow key={r.rowNumber}>
                <TableCell className="font-mono text-xs">{r.registerNumber || `row ${r.rowNumber}`}</TableCell>
                <TableCell>{r.name || "—"}</TableCell>
                <TableCell><StatusPill status={r.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.reason ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function BatchHistory() {
  const batches = useImportBatches();
  const regen = useRegenerateBatch();
  const [regenResult, setRegenResult] = useState<BatchRegenResult | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-base font-semibold text-foreground">Past imports</h2>

      {regenResult && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-primary/30 bg-accent/40 p-4">
          <p className="text-sm text-foreground">
            Regenerated <strong>{regenResult.regeneratedCount}</strong> password(s),{" "}
            {regenResult.skippedCount} skipped (already in use).
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => downloadRegenResults(regenResult)}>
              <Download className="size-4" />
              Download
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRegenResult(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border">
        {batches.isPending ? (
          <Empty>Loading…</Empty>
        ) : batches.isError ? (
          <Empty><span className="text-destructive">Couldn’t load imports.</span></Empty>
        ) : batches.data.length === 0 ? (
          <Empty>No imports yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Dept</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.data.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="max-w-48 truncate">{b.fileName ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{b.department.code}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {b.createdCount} created · {b.skippedCount} skipped · {b.errorCount} errors
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.createdBy}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={regen.isPending}
                        onClick={() =>
                          regen.mutate(b.id, { onSuccess: (r) => setRegenResult(r) })
                        }
                      >
                        <RotateCcw className="size-4" />
                        Regenerate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      {regen.isError && (
        <p role="alert" className="text-sm text-destructive">
          {regen.error instanceof Error ? regen.error.message : "Regenerate failed."}
        </p>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: ImportRowStatus }) {
  // Dot carries the status hue; the label stays foreground text so it's legible
  // on the page background (status-*-foreground is meant for on-color text).
  const map = {
    created: { dot: "bg-status-present", label: "Created" },
    skipped: { dot: "bg-status-od", label: "Skipped" },
    error: { dot: "bg-status-absent", label: "Error" },
  }[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
      <span className={`size-1.5 rounded-full ${map.dot}`} />
      {map.label}
    </span>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <span>
      <span className="font-semibold text-foreground">{n}</span> {label}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
      <FileSpreadsheet className="size-4 opacity-60" />
      {children}
    </div>
  );
}
