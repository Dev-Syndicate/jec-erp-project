// Bulk student import — a 3-step dialog: pick a program + file, PREVIEW what the
// server parsed (valid rows + row errors) before anything is created, then COMMIT
// and show per-row results. Created accounts carry a one-time temp password, so
// the results step offers a CSV download — the only practical way to deliver many
// passwords. The parse/provision logic is server-side (lib/student-import.ts).
"use client";

import { useState } from "react";
import { Upload, Download, FileSpreadsheet, FileDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { FormError } from "@/components/form-error";
import type { ImportOutcome, ImportRowError } from "@/features/students/types";
import { FormSelect } from "@/components/form-select";
import { ClassCascade } from "@/features/students/components/class-cascade";
import {
  useClassOptions,
  useImportCommit,
  useImportPreview,
  useProgramOptions,
} from "@/features/students/hooks/use-students";

// Escape a CSV cell (wrap + double any quotes) so names/emails can't break it.
const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

// The exact columns lib/student-import.ts expects, with one example row so the
// admin can see the format (dates yyyy-mm-dd; gender MALE/FEMALE/OTHER or blank).
const TEMPLATE_HEADERS = [
  "name",
  "email",
  "registerNumber",
  "rollNumber",
  "dateOfBirth",
  "phone",
  "gender",
];
const TEMPLATE_EXAMPLE = [
  "Asha Kumar",
  "asha.kumar@example.com",
  "422021104042",
  "101",
  "2004-05-12",
  "9876543210",
  "FEMALE",
];

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS.join(","), TEMPLATE_EXAMPLE.map(csvCell).join(",")].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "student-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCreatedCsv(outcomes: ImportOutcome[]) {
  const created = outcomes.filter((o) => o.status === "created");
  const header = ["registerNumber", "name", "email", "tempPassword"].join(",");
  const lines = created.map((o) =>
    [o.registerNumber, o.name, o.email, o.tempPassword ?? ""].map(csvCell).join(","),
  );
  const csv = [header, ...lines].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "imported-students.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type Phase = "select" | "preview" | "results";

export function ImportStudentsDialog({ onClose }: { onClose: () => void }) {
  const programs = useProgramOptions();
  const classes = useClassOptions();
  const activePrograms = (programs.data ?? []).filter((p) => p.isActive);
  const preview = useImportPreview();
  const commit = useImportCommit();

  const [phase, setPhase] = useState<Phase>("select");
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const classesInProgram = (classes.data ?? []).filter((c) => c.isActive && c.programId === programId);
  const canProceed = !!file && !!programId && !!classId;

  const previewData = preview.data;
  const resultData = commit.data;

  function runPreview() {
    if (!canProceed) return;
    preview.mutate({ file: file!, programId }, { onSuccess: () => setPhase("preview") });
  }
  function runCommit() {
    if (!canProceed) return;
    commit.mutate({ file: file!, programId, classId }, { onSuccess: () => setPhase("results") });
  }
  function backToSelect() {
    preview.reset();
    setPhase("select");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import students</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file with columns: name, email, registerNumber, rollNumber,
            dateOfBirth, phone, gender. All rows are added to the program + class you pick, for the
            active academic year.
          </DialogDescription>
        </DialogHeader>

        {phase === "select" && (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-program">Program</Label>
                <FormSelect
                  id="import-program"
                  value={programId}
                  onChange={(v) => {
                    setProgramId(v);
                    setClassId(""); // classes differ per program — reset the choice
                  }}
                  options={activePrograms.map((p) => ({ value: p.id, label: p.label }))}
                  placeholder={programs.isPending ? "Loading…" : "Select a program"}
                />
              </div>
              {/* Every imported student joins this class for the active year. */}
              <ClassCascade
                key={programId || "none"}
                classes={classesInProgram}
                onChange={setClassId}
                loading={classes.isPending}
                disabled={programId === ""}
                idPrefix="import"
              />
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="import-file">Spreadsheet</Label>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    onClick={downloadTemplate}
                    data-icon="inline-start"
                    className="h-auto px-0 text-muted-foreground hover:text-foreground"
                  >
                    <FileDown />
                    Download template
                  </Button>
                </div>
                <Input
                  size="lg"
                  id="import-file"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="pt-2"
                />
                {file && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileSpreadsheet className="size-3.5" />
                    {file.name}
                  </span>
                )}
              </div>
              {preview.isError && <FormError>{errorMessage(preview.error)}</FormError>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={preview.isPending}>
                Cancel
              </Button>
              <Button
                onClick={runPreview}
                disabled={!canProceed || preview.isPending}
                data-icon="inline-start"
              >
                <Upload />
                {preview.isPending ? "Reading…" : "Preview"}
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === "preview" && previewData && (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex gap-2 text-sm">
                <Badge variant="success" className="rounded-md px-2 py-1">
                  {previewData.rows.length} ready to import
                </Badge>
                {previewData.errors.length > 0 && (
                  <span className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
                    {previewData.errors.length} with errors
                  </span>
                )}
              </div>
              {previewData.tooManyRows && (
                <FormError>Only the first 1000 rows are processed; the rest were dropped.</FormError>
              )}
              {previewData.errors.length > 0 && <RowErrorTable errors={previewData.errors} />}
              {commit.isError && <FormError>{errorMessage(commit.error)}</FormError>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={backToSelect} disabled={commit.isPending}>
                Back
              </Button>
              <Button onClick={runCommit} disabled={previewData.rows.length === 0 || commit.isPending}>
                {commit.isPending
                  ? "Importing…"
                  : `Import ${previewData.rows.length} student${previewData.rows.length === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === "results" && resultData && (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="success" className="rounded-md px-2 py-1">
                  {resultData.outcomes.filter((o) => o.status === "created").length} created
                </Badge>
                <span className="rounded-md bg-muted px-2 py-1 font-medium text-muted-foreground">
                  {resultData.outcomes.filter((o) => o.status === "skipped").length} skipped
                </span>
                {resultData.outcomes.filter((o) => o.status === "error").length > 0 && (
                  <span className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
                    {resultData.outcomes.filter((o) => o.status === "error").length} failed
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Download the created accounts now — the temporary passwords are shown once.
              </p>
              <OutcomeTable outcomes={resultData.outcomes} />
              {resultData.parseErrors.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    {resultData.parseErrors.length} rows never parsed
                  </summary>
                  <div className="mt-2">
                    <RowErrorTable errors={resultData.parseErrors} />
                  </div>
                </details>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => downloadCreatedCsv(resultData.outcomes)}
                disabled={!resultData.outcomes.some((o) => o.status === "created")}
                data-icon="inline-start"
              >
                <Download />
                Download CSV
              </Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// A sticky header is correct here, unlike in most dialogs: this list carries its
// own BOUNDED height, so the header pins against that box rather than fighting
// DialogContent's own sticky header.
function RowErrorTable({ errors }: { errors: ImportRowError[] }) {
  return (
    <Table
      density="compact"
      containerClassName="max-h-48 overflow-y-auto rounded-lg border border-border"
    >
      <TableHeader sticky>
        <TableRow>
          <TableHead>Row</TableHead>
          <TableHead>Register no.</TableHead>
          <TableHead>Problem</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {errors.map((e) => (
          <TableRow key={`${e.rowNumber}-${e.registerNumber}`}>
            <TableCell className="tabular-nums text-muted-foreground">{e.rowNumber}</TableCell>
            <TableCell className="font-mono text-xs">{e.registerNumber || "—"}</TableCell>
            <TableCell className="whitespace-normal text-destructive">{e.reason}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OutcomeTable({ outcomes }: { outcomes: ImportOutcome[] }) {
  // Token-backed rather than raw emerald: `created` is a success outcome, and
  // --success is the token that means that everywhere else in the app.
  const tone: Record<ImportOutcome["status"], string> = {
    created: "text-success",
    skipped: "text-muted-foreground",
    error: "text-destructive",
  };
  return (
    <Table
      density="compact"
      containerClassName="max-h-56 overflow-y-auto rounded-lg border border-border"
    >
      <TableHeader sticky>
        <TableRow>
          <TableHead>Register no.</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Result</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {outcomes.map((o) => (
          <TableRow key={`${o.rowNumber}-${o.registerNumber}`}>
            <TableCell className="font-mono text-xs">{o.registerNumber}</TableCell>
            <TableCell>{o.name}</TableCell>
            <TableCell className={`whitespace-normal ${tone[o.status]}`}>
              {o.status}
              {o.reason ? ` — ${o.reason}` : ""}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
