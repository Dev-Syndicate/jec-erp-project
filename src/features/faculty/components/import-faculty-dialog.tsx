// Bulk faculty import — a 3-step dialog: pick a file, PREVIEW what the server
// parsed (valid rows + row errors) before anything is created, then choose the
// department + roles and COMMIT, showing per-row results.
//
// Created accounts carry a one-time temp password, so the results step offers a
// CSV download — the only practical way to deliver many passwords, since they are
// never stored anywhere. Leave without downloading and the only recovery is
// regenerating each password one at a time.
//
// Mirrors the student importer (features/students/components/import-students-dialog.tsx)
// on purpose. It differs in one way that matters: roles are picked HERE and sent
// to the server, never read from the sheet — the server puts them through the same
// subset check as a single add, so an import can't mint an account more powerful
// than its creator.
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
import { errorMessage } from "@/lib/errors";
import { FormError } from "@/components/form-error";
import type { ImportOutcome, ImportRowError } from "@/features/faculty/types";
import { FormSelect } from "@/components/form-select";
import {
  useDepartmentOptions,
  useFacultyImportCommit,
  useFacultyImportPreview,
  useRoles,
} from "@/features/faculty/hooks/use-faculty";

// Escape a CSV cell (wrap + double any quotes) so names/emails can't break it.
const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

// The exact columns lib/faculty-import.ts expects, with one example row so the
// admin can see the format (dates yyyy-mm-dd; gender MALE/FEMALE/OTHER or blank).
const TEMPLATE_HEADERS = [
  "name",
  "email",
  "staffId",
  "designation",
  "phone",
  "gender",
  "dateOfBirth",
];
const TEMPLATE_EXAMPLE = [
  "R Kumar",
  "r.kumar@example.com",
  "JEC001",
  "Asst. Professor",
  "9876543210",
  "MALE",
  "1985-03-12",
];

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS.join(","), TEMPLATE_EXAMPLE.map(csvCell).join(",")].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "faculty-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// The whole reason this dialog exists. Temp passwords live only in this response
// — Firebase hashes them and no Neon column holds them — so this file is the one
// chance to capture them.
function downloadCreatedCsv(outcomes: ImportOutcome[]) {
  const created = outcomes.filter((o) => o.status === "created");
  const header = ["staffId", "name", "email", "tempPassword"].join(",");
  const lines = created.map((o) =>
    [o.staffId, o.name, o.email, o.tempPassword ?? ""].map(csvCell).join(","),
  );
  const csv = [header, ...lines].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "imported-faculty.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type Phase = "select" | "preview" | "results";

export function ImportFacultyDialog({ onClose }: { onClose: () => void }) {
  const departments = useDepartmentOptions();
  const roles = useRoles();
  const preview = useFacultyImportPreview();
  const commit = useFacultyImportCommit();

  const [phase, setPhase] = useState<Phase>("select");
  const [file, setFile] = useState<File | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  // Set once the results are downloaded, so closing can warn if they weren't.
  const [downloaded, setDownloaded] = useState(false);

  const activeDepartments = (departments.data ?? []).filter((d) => d.isActive);
  const previewData = preview.data;
  const resultData = commit.data;

  const createdCount =
    resultData?.outcomes.filter((o) => o.status === "created").length ?? 0;

  function runPreview() {
    if (!file) return;
    preview.mutate({ file }, { onSuccess: () => setPhase("preview") });
  }
  function runCommit() {
    if (!file || !departmentId || roleIds.length === 0) return;
    commit.mutate({ file, departmentId, roleIds }, { onSuccess: () => setPhase("results") });
  }
  function backToSelect() {
    preview.reset();
    setPhase("select");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import faculty</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file with columns: name, email, staffId, designation, phone,
            gender, dateOfBirth. Everyone in the file joins the department and roles you pick.
          </DialogDescription>
        </DialogHeader>

        {phase === "select" && (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="faculty-import-file">Spreadsheet</Label>
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
                  id="faculty-import-file"
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
              <Button onClick={runPreview} disabled={!file || preview.isPending} data-icon="inline-start">
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
                <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-medium text-emerald-600">
                  {previewData.rows.length} ready to import
                </span>
                {previewData.errors.length > 0 && (
                  <span className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
                    {previewData.errors.length} with errors
                  </span>
                )}
              </div>
              {previewData.tooManyRows && (
                <FormError>Only the first 1000 rows are processed; the rest were dropped.</FormError>
              )}

              {/* Department + roles are asked HERE rather than up front: there's no
                  point choosing them for a file that turns out to be unparseable. */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="faculty-import-department">Employing department</Label>
                <FormSelect
                  id="faculty-import-department"
                  value={departmentId}
                  onChange={setDepartmentId}
                  options={activeDepartments.map((d) => ({
                    value: d.id,
                    label: `${d.name} (${d.code})`,
                  }))}
                  placeholder={departments.isPending ? "Loading…" : "Select a department"}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Roles</Label>
                <div className="flex flex-wrap gap-2">
                  {(roles.data ?? []).map((r) => {
                    const on = roleIds.includes(r.id);
                    return (
                      <Button
                        key={r.id}
                        type="button"
                        variant={on ? "default" : "outline"}
                        size="sm"
                        onClick={() =>
                          setRoleIds((prev) =>
                            on ? prev.filter((id) => id !== r.id) : [...prev, r.id],
                          )
                        }
                      >
                        {r.name}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Applied to everyone in the file. Roles are never read from the spreadsheet.
                </p>
              </div>

              {previewData.errors.length > 0 && <RowErrorTable errors={previewData.errors} />}
              {commit.isError && <FormError>{errorMessage(commit.error)}</FormError>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={backToSelect} disabled={commit.isPending}>
                Back
              </Button>
              <Button
                onClick={runCommit}
                disabled={
                  previewData.rows.length === 0 ||
                  departmentId === "" ||
                  roleIds.length === 0 ||
                  commit.isPending
                }
              >
                {commit.isPending
                  ? "Importing…"
                  : `Import ${previewData.rows.length} account${previewData.rows.length === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === "results" && resultData && (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-medium text-emerald-600">
                  {createdCount} created
                </span>
                <span className="rounded-md bg-muted px-2 py-1 font-medium text-muted-foreground">
                  {resultData.outcomes.filter((o) => o.status === "skipped").length} skipped
                </span>
                {resultData.outcomes.filter((o) => o.status === "error").length > 0 && (
                  <span className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
                    {resultData.outcomes.filter((o) => o.status === "error").length} failed
                  </span>
                )}
              </div>
              {createdCount > 0 && (
                <p
                  className={`text-sm ${downloaded ? "text-muted-foreground" : "font-medium text-foreground"}`}
                >
                  {downloaded
                    ? "Passwords downloaded. They can't be shown again."
                    : "Download the created accounts now — the temporary passwords are shown once and can't be recovered afterwards."}
                </p>
              )}
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
                onClick={() => {
                  downloadCreatedCsv(resultData.outcomes);
                  setDownloaded(true);
                }}
                disabled={createdCount === 0}
                data-icon="inline-start"
              >
                <Download />
                Download CSV
              </Button>
              {/* Only nags while there IS something unsaved to lose. */}
              <Button onClick={onClose} variant={!downloaded && createdCount > 0 ? "outline" : "default"}>
                {!downloaded && createdCount > 0 ? "Close without downloading" : "Done"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RowErrorTable({ errors }: { errors: ImportRowError[] }) {
  return (
    <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/80 text-left">
          <tr>
            <th className="px-2 py-1.5 font-medium">Row</th>
            <th className="px-2 py-1.5 font-medium">Staff ID</th>
            <th className="px-2 py-1.5 font-medium">Problem</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e) => (
            <tr key={`${e.rowNumber}-${e.staffId}`} className="border-t border-border">
              <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{e.rowNumber}</td>
              <td className="px-2 py-1.5 font-mono text-xs">{e.staffId || "—"}</td>
              <td className="px-2 py-1.5 text-destructive">{e.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeTable({ outcomes }: { outcomes: ImportOutcome[] }) {
  const tone: Record<ImportOutcome["status"], string> = {
    created: "text-emerald-600",
    skipped: "text-muted-foreground",
    error: "text-destructive",
  };
  return (
    <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/80 text-left">
          <tr>
            <th className="px-2 py-1.5 font-medium">Staff ID</th>
            <th className="px-2 py-1.5 font-medium">Name</th>
            <th className="px-2 py-1.5 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {outcomes.map((o) => (
            <tr key={`${o.rowNumber}-${o.staffId}`} className="border-t border-border">
              <td className="px-2 py-1.5 font-mono text-xs">{o.staffId}</td>
              <td className="px-2 py-1.5">{o.name}</td>
              <td className={`px-2 py-1.5 ${tone[o.status]}`}>
                {o.status}
                {o.reason ? ` — ${o.reason}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
