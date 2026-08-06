// Bulk login slips for students who have not logged in yet ("Invited").
//
// Two things make this need a confirmation step rather than being a plain
// download button:
//
//   1. It RESETS. The passwords originally issued cannot be read back (Firebase
//      keeps only hashes), so the server generates new ones. Any slip printed
//      earlier stops working the moment this runs.
//   2. The result is shown ONCE. Close without saving and the only recovery is
//      running it again, which resets everyone a second time.
//
// One CSV per class, because slips are handed out class by class.
"use client";

import { useState } from "react";
import { Download, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import type { CredentialResult } from "@/features/students/types";
import { useCredentials } from "@/features/students/hooks/use-students";

const csvCell = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** One CSV per class — the columns the office asked for, in that order. */
function downloadGroup(g: CredentialResult["groups"][number]) {
  const header = ["registerNumber", "rollNumber", "name", "email", "tempPassword"].join(",");
  const lines = g.students.map((s) =>
    [s.registerNumber, s.rollNumber, s.name, s.email, s.tempPassword].map(csvCell).join(","),
  );
  const csv = [header, ...lines].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `credentials-${g.fileLabel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CredentialsDialog({ onClose }: { onClose: () => void }) {
  const run = useCredentials();
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const result = run.data;

  function downloadAll() {
    if (!result) return;
    for (const g of result.groups) downloadGroup(g);
    setSaved(new Set(result.groups.map((g) => g.classId)));
  }

  // --- results -------------------------------------------------------------
  if (result) {
    const allSaved = result.groups.every((g) => saved.has(g.classId));
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {result.total} login{result.total === 1 ? "" : "s"} reissued
            </DialogTitle>
            <DialogDescription>
              {allSaved
                ? "Downloaded. These passwords can't be shown again."
                : "Download each class now — these passwords are shown once and can't be recovered."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {result.groups.map((g) => (
              <div
                key={g.classId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{g.classLabel}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.students.length} student{g.students.length === 1 ? "" : "s"}
                  </span>
                </div>
                <Button
                  variant={saved.has(g.classId) ? "ghost" : "outline"}
                  size="sm"
                  onClick={() => {
                    downloadGroup(g);
                    setSaved((prev) => new Set(prev).add(g.classId));
                  }}
                  data-icon="inline-start"
                >
                  <Download />
                  {saved.has(g.classId) ? "Downloaded" : "CSV"}
                </Button>
              </div>
            ))}
            {result.groups.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nobody is waiting to log in — every student has already set their own password.
              </p>
            )}
            {result.failed.length > 0 && (
              <FormError>{result.failed.length} could not be reset:{" "}
                {result.failed.map((f) => f.registerNumber).join(", ")}</FormError>
            )}
          </div>

          <DialogFooter>
            {result.groups.length > 1 && (
              <Button variant="outline" onClick={downloadAll} data-icon="inline-start">
                <Download />
                Download all
              </Button>
            )}
            <Button onClick={onClose} variant={allSaved ? "default" : "outline"}>
              {allSaved || result.groups.length === 0 ? "Done" : "Close without downloading"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // --- confirmation --------------------------------------------------------
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Download login credentials</DialogTitle>
          <DialogDescription>
            Issues a fresh temporary password to every student who hasn&rsquo;t logged in yet, and
            downloads one CSV per class.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground">
            Passwords already issued <span className="font-medium text-foreground">stop working</span>.
            The old ones can&rsquo;t be looked up — they aren&rsquo;t stored anywhere — so this
            replaces them.
          </p>
          <p className="text-muted-foreground">
            Students who have already set their own password are{" "}
            <span className="font-medium text-foreground">not touched</span>, so nobody is locked out.
          </p>
        </div>

        {run.isError && (
          <FormError>{errorMessage(run.error)}</FormError>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={run.isPending}>
            Cancel
          </Button>
          <Button onClick={() => run.mutate(undefined)} disabled={run.isPending} data-icon="inline-start">
            <KeyRound />
            {run.isPending ? "Reissuing…" : "Reissue and download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
