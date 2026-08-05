// Bulk login slips for staff who have not logged in yet ("Invited").
//
// The student sibling (features/students/components/credentials-dialog.tsx)
// carries the full reasoning; the same two facts drive the confirmation step:
// the passwords originally issued cannot be read back, so this RESETS them, and
// the result is shown once.
//
// One CSV, not one per class: staff are handed their slips as a department.
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
import type { StaffCredentialResult } from "@/features/faculty/types";
import { useStaffCredentials } from "@/features/faculty/hooks/use-faculty";

const csvCell = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function download(result: StaffCredentialResult) {
  const header = ["staffId", "name", "email", "department", "designation", "tempPassword"].join(",");
  const lines = result.staff.map((s) =>
    [s.staffId, s.name, s.email, s.department, s.designation, s.tempPassword].map(csvCell).join(","),
  );
  const csv = [header, ...lines].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "credentials-faculty.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function StaffCredentialsDialog({ onClose }: { onClose: () => void }) {
  const run = useStaffCredentials();
  const [saved, setSaved] = useState(false);
  const result = run.data;

  if (result) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {result.total} login{result.total === 1 ? "" : "s"} reissued
            </DialogTitle>
            <DialogDescription>
              {result.total === 0
                ? "Nobody is waiting to log in — every staff account has already set its own password."
                : saved
                  ? "Downloaded. These passwords can't be shown again."
                  : "Download now — these passwords are shown once and can't be recovered."}
            </DialogDescription>
          </DialogHeader>

          {result.failed.length > 0 && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {result.failed.length} could not be reset:{" "}
              {result.failed.map((f) => f.staffId).join(", ")}
            </p>
          )}

          <DialogFooter>
            {result.total > 0 && (
              <Button
                variant="outline"
                onClick={() => { download(result); setSaved(true); }}
                data-icon="inline-start"
              >
                <Download />
                {saved ? "Download again" : "Download CSV"}
              </Button>
            )}
            <Button onClick={onClose} variant={saved || result.total === 0 ? "default" : "outline"}>
              {saved || result.total === 0 ? "Done" : "Close without downloading"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Download login credentials</DialogTitle>
          <DialogDescription>
            Issues a fresh temporary password to every staff member who hasn&rsquo;t logged in yet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground">
            Passwords already issued <span className="font-medium text-foreground">stop working</span>.
            The old ones can&rsquo;t be looked up — they aren&rsquo;t stored anywhere — so this
            replaces them.
          </p>
          <p className="text-muted-foreground">
            Staff who have already set their own password are{" "}
            <span className="font-medium text-foreground">not touched</span>.
          </p>
        </div>

        {run.isError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage(run.error)}
          </p>
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
