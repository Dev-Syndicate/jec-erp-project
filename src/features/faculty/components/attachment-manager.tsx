// Cross-department teaching attachments — lend a lecturer to another department
// for the active semester. Super-Admin only (the page gates with AuthGate; the
// API re-checks every call).
//
// WHY THIS SCREEN EXISTS: employment answers "who pays them", not "where may they
// teach". Science & Humanities teaches first year for every department and its
// staff also visit others, so the two questions genuinely diverge. Without an
// attachment a lecturer can only ever be timetabled in the department that
// employs them.
//
// Attachments are SEMESTER-BOUND: they lapse at rollover and must be renewed, so
// a one-term loan can't quietly become permanent.
"use client";

import { useState } from "react";
import { Plus, Trash2, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { PageShell } from "@/app/(app)/page-shell";
import { LoadingState } from "@/components/loading-state";
import { FormError } from "@/components/form-error";
import { PageHeader } from "@/app/(app)/page-header";
import type { Attachment } from "@/features/faculty/types";
import {
  useAttachments,
  useCreateAttachment,
  useDeleteAttachment,
  useDepartmentOptions,
  useFaculty,
} from "@/features/faculty/hooks/use-faculty";

export function AttachmentManager() {
  const { data: attachments, isPending, isError, error } = useAttachments();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Attachment | null>(null);

  return (
    <PageShell>
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Faculty · Attachments"
          title="Cross-department teaching"
          description="Lend a lecturer to another department for this semester so they can be put on its timetable. Their home department doesn't change. Attachments lapse at the end of the semester and need renewing."
        />
        <Button onClick={() => setAdding(true)} data-icon="inline-start">
          <Plus />
          Attach a lecturer
        </Button>
      </div>

      {isPending ? (
        <LoadingState label="Loading attachments…" />
      ) : isError ? (
        <FormError>{errorMessage(error)}</FormError>
      ) : attachments.length === 0 ? (
        <EmptyState onAdd={() => setAdding(true)} />
      ) : (
        <div className="rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lecturer</TableHead>
                <TableHead>Staff ID</TableHead>
                <TableHead>Home → teaches in</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Arranged by</TableHead>
                <TableHead className="w-0 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attachments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {a.facultyName}
                    {/* An attachment on a deactivated account grants nothing — the
                        API refuses to timetable them — so flag it rather than let
                        the row look live. */}
                    {a.facultyStatus !== "ACTIVE" && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                        Inactive
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {a.staffId}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 font-mono text-xs">
                      <span className="text-muted-foreground">{a.homeDepartmentCode}</span>
                      <ArrowRight className="size-3 text-muted-foreground" />
                      <span className="font-medium">{a.hostDepartmentCode}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.reason ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.assignedByName}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setRemoving(a)}
                        aria-label="End attachment"
                        title="End attachment"
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {adding && <AttachDialog onClose={() => setAdding(false)} />}
      {removing !== null && (
        <RemoveDialog attachment={removing} onClose={() => setRemoving(null)} />
      )}
    </PageShell>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">
        No cross-department attachments this semester.
      </p>
      <p className="max-w-md text-xs text-muted-foreground">
        Every lecturer can currently only be timetabled in the department that employs them.
      </p>
      <Button variant="outline" onClick={onAdd} data-icon="inline-start">
        <Plus />
        Attach a lecturer
      </Button>
    </div>
  );
}

function AttachDialog({ onClose }: { onClose: () => void }) {
  const faculty = useFaculty();
  const departments = useDepartmentOptions();
  const create = useCreateAttachment();

  const [facultyProfileId, setFacultyProfileId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [reason, setReason] = useState("");

  const staff = (faculty.data ?? []).filter((f) => f.status === "ACTIVE");
  const facultyOptions = staff.map((f) => ({
    value: f.id,
    label: `${f.displayName} · ${f.departmentCode}`,
  }));

  // Their home department can't also be the host — the API refuses it, so don't
  // offer it. Resolved from the current selection so it updates as they choose.
  const homeDepartmentId = staff.find((f) => f.id === facultyProfileId)?.departmentId;
  const departmentOptions = (departments.data ?? [])
    .filter((d) => d.isActive && d.id !== homeDepartmentId)
    .map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));

  // Derived, not reset in an effect: if the chosen lecturer's home department is
  // the one already selected as host, that selection is simply void.
  const effectiveDepartmentId = departmentId === homeDepartmentId ? "" : departmentId;

  const valid = facultyProfileId !== "" && effectiveDepartmentId !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    create.mutate(
      {
        facultyProfileId,
        departmentId: effectiveDepartmentId,
        reason: reason.trim() === "" ? null : reason.trim(),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach a lecturer</DialogTitle>
          <DialogDescription>
            Lets this lecturer be timetabled in another department for the current semester. Their
            home department, roles and everything else stay as they are.
          </DialogDescription>
        </DialogHeader>

        <form id="attachment-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="attachment-faculty">Lecturer</Label>
            <Select
              value={facultyProfileId}
              onValueChange={(v) => setFacultyProfileId((v as string) ?? "")}
              disabled={staff.length === 0}
            >
              <SelectTrigger size="lg" id="attachment-faculty" className="w-full">
                <SelectValue placeholder={faculty.isPending ? "Loading…" : "Select a lecturer"}>
                  {(v) =>
                    facultyOptions.find((o) => o.value === v)?.label ?? "Select a lecturer"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {facultyOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="attachment-department">Department they&rsquo;ll teach in</Label>
            <Select
              value={effectiveDepartmentId}
              onValueChange={(v) => setDepartmentId((v as string) ?? "")}
              disabled={facultyProfileId === ""}
            >
              <SelectTrigger size="lg" id="attachment-department" className="w-full">
                <SelectValue
                  placeholder={
                    facultyProfileId === "" ? "Choose a lecturer first" : "Select a department"
                  }
                >
                  {(v) =>
                    departmentOptions.find((o) => o.value === v)?.label ?? "Select a department"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {departmentOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Their own department isn&rsquo;t listed — they can already teach there.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="attachment-reason">Reason (optional)</Label>
            <Input
              size="lg"
              id="attachment-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Teaching first-year Maths"
            />
          </div>

          {create.isError && (
            <FormError>{errorMessage(create.error)}</FormError>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="attachment-form" disabled={!valid || create.isPending}>
            {create.isPending ? "Attaching…" : "Attach"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const del = useDeleteAttachment();
  // Set once the delete returns: existing timetable cells survive, so say so
  // rather than let the admin assume the grid cleaned itself up.
  const [stranded, setStranded] = useState<number | null>(null);

  if (stranded !== null) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attachment ended</DialogTitle>
            <DialogDescription>
              {stranded === 0
                ? `${attachment.facultyName} can no longer be timetabled in ${attachment.hostDepartmentCode}.`
                : `${attachment.facultyName} still holds ${stranded} period${
                    stranded === 1 ? "" : "s"
                  } on ${attachment.hostDepartmentCode}'s timetable. Those stay on the grid and can still be marked, but they can't be edited until the lecturer is attached again.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End this attachment?</DialogTitle>
          <DialogDescription>
            {attachment.facultyName} will no longer be available to timetable in{" "}
            {attachment.hostDepartmentName}. They stay employed by{" "}
            {attachment.homeDepartmentName} exactly as before.
          </DialogDescription>
        </DialogHeader>
        {del.isError && (
          <FormError>{errorMessage(del.error)}</FormError>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={del.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={() =>
              del.mutate(attachment.id, {
                onSuccess: (res) => setStranded(res.strandedSlots),
              })
            }
          >
            {del.isPending ? "Ending…" : "End attachment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
