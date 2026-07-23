// Leave / OD — a student applies and tracks status; an approver (class teacher for
// stage 1, HOD for stage 2) works their queue. One page, role-aware: the server
// tells us isStudent / canApprove, so students never see approve controls and
// approvers never see the Apply button. The two-stage workflow + attendance write
// live entirely in the API.
"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Check, X } from "lucide-react";

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
import { PageHeader } from "@/app/(app)/page-header";
import { FormSelect } from "@/features/leave/components/form-select";
import {
  LEAVE_TYPES,
  STATUS_META,
  type LeaveRequest,
  type LeaveType,
} from "@/features/leave/types";
import { useActOnLeave, useApplyForLeave, useLeaveRequests } from "@/features/leave/hooks/use-leave";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}

function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      {children}
    </p>
  );
}

function StatusPill({ status }: { status: LeaveRequest["status"] }) {
  const meta = STATUS_META[status];
  const tone =
    meta.tone === "approved"
      ? "bg-primary/10 text-primary"
      : meta.tone === "rejected"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {meta.label}
    </span>
  );
}

function TypePill({ type }: { type: LeaveType }) {
  return (
    <span className="inline-flex rounded-full bg-sidebar-accent px-2 py-0.5 font-mono text-[0.65rem] font-semibold text-sidebar-accent-foreground">
      {type === "OD" ? "OD" : "LEAVE"}
    </span>
  );
}

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export function LeaveManager() {
  const list = useLeaveRequests();
  const [applying, setApplying] = useState(false);

  const isStudent = list.data?.isStudent ?? false;
  const requests = useMemo(() => list.data?.requests ?? [], [list.data?.requests]);

  // Approvers: three buckets by what the viewer can do with each request NOW.
  //  • needsAction — this viewer can act at the request's current stage.
  //  • inProgress — still open, but waiting on the OTHER stage (e.g. an HOD sees a
  //    PENDING_TEACHER request here, read-only, until the teacher approves).
  //  • closed — approved/rejected history.
  const open = useMemo(
    () => requests.filter((r) => r.status === "PENDING_TEACHER" || r.status === "PENDING_HOD"),
    [requests],
  );
  const needsAction = useMemo(() => open.filter((r) => r.actionable), [open]);
  const inProgress = useMemo(() => open.filter((r) => !r.actionable), [open]);
  const closed = useMemo(
    () => requests.filter((r) => r.status === "APPROVED" || r.status === "REJECTED"),
    [requests],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          eyebrow="Academic · Leave & OD"
          title={isStudent ? "My leave & OD" : "Leave & OD approvals"}
          description={
            isStudent
              ? "Apply for on-duty or leave and track its approval."
              : "Review your students' OD and leave requests. Class teacher approves first, then the HOD."
          }
        />
        {isStudent && (
          <Button data-icon="inline-start" onClick={() => setApplying(true)}>
            <CalendarPlus />
            Apply
          </Button>
        )}
      </div>

      {list.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : list.isError ? (
        <FormError>{errorMessage(list.error)}</FormError>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isStudent ? "You haven't applied for anything yet." : "No requests to review."}
        </p>
      ) : isStudent ? (
        <LeaveTable rows={requests} showStudent={false} />
      ) : (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Needs your action ({needsAction.length})
            </h2>
            {needsAction.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>
            ) : (
              <LeaveTable rows={needsAction} showStudent />
            )}
          </section>
          {inProgress.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                In progress ({inProgress.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Awaiting the other approver — no action from you yet.
              </p>
              <LeaveTable rows={inProgress} showStudent />
            </section>
          )}
          {closed.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-foreground">History ({closed.length})</h2>
              <LeaveTable rows={closed} showStudent />
            </section>
          )}
        </div>
      )}

      {applying && <ApplyDialog onClose={() => setApplying(false)} />}
    </div>
  );
}

function LeaveTable({ rows, showStudent }: { rows: LeaveRequest[]; showStudent: boolean }) {
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);
  const act = useActOnLeave();
  // Show the Action column only if at least one row is actionable by this viewer.
  const anyActionable = rows.some((r) => r.actionable);

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <table className="w-full min-w-160 border-collapse text-sm">
        <thead>
          <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
            {showStudent && <th className="px-3 py-2 font-medium">Student</th>}
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Dates</th>
            <th className="px-3 py-2 font-medium">Reason</th>
            <th className="px-3 py-2 font-medium">Status</th>
            {anyActionable && <th className="w-0 px-3 py-2 text-right font-medium">Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-foreground/10 align-top last:border-b-0">
              {showStudent && (
                <td className="px-3 py-2">
                  <div className="font-medium">{r.student.displayName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.student.registerNumber}</div>
                </td>
              )}
              <td className="px-3 py-2">
                <TypePill type={r.type} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {fmt(r.fromDate)}
                {r.fromDate !== r.toDate && <> – {fmt(r.toDate)}</>}
              </td>
              <td className="max-w-xs px-3 py-2">
                <span className="text-muted-foreground">{r.reason}</span>
                {r.status === "REJECTED" && r.rejectionReason && (
                  <div className="mt-1 text-xs text-destructive">Rejected: {r.rejectionReason}</div>
                )}
              </td>
              <td className="px-3 py-2">
                <StatusPill status={r.status} />
              </td>
              {anyActionable && (
                <td className="px-3 py-2">
                  {r.actionable && (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        data-icon="inline-start"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: r.id, action: { action: "approve" } })}
                        aria-label={`Approve ${r.student.displayName}'s request`}
                      >
                        <Check />
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-icon="inline-start"
                        disabled={act.isPending}
                        onClick={() => setRejecting(r)}
                        aria-label={`Reject ${r.student.displayName}'s request`}
                      >
                        <X />
                        Reject
                      </Button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {act.isError && (
        <div className="p-3">
          <FormError>{errorMessage(act.error)}</FormError>
        </div>
      )}

      {rejecting && (
        <RejectDialog
          request={rejecting}
          onClose={() => setRejecting(null)}
          onConfirm={(reason) =>
            act.mutate(
              { id: rejecting.id, action: { action: "reject", rejectionReason: reason } },
              { onSuccess: () => setRejecting(null) },
            )
          }
          pending={act.isPending}
        />
      )}
    </div>
  );
}

function RejectDialog({
  request,
  onClose,
  onConfirm,
  pending,
}: {
  request: LeaveRequest;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject request</DialogTitle>
          <DialogDescription>
            {request.student.displayName}&apos;s {request.type === "OD" ? "OD" : "leave"} request. A
            reason is required and shown to the student.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reject-reason">Reason</Label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            placeholder="Why is this being rejected?"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || pending}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? "Rejecting…" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyDialog({ onClose }: { onClose: () => void }) {
  const apply = useApplyForLeave();
  const [type, setType] = useState<LeaveType>("OD");
  // Single day is the common case: show one date field, and send it as both
  // from/to. A range reveals the second field. The API treats from===to as one day.
  const [multiDay, setMultiDay] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");

  // For a single day, the effective end date is the start date.
  const effectiveTo = multiDay ? toDate : fromDate;
  const valid =
    fromDate !== "" &&
    effectiveTo !== "" &&
    effectiveTo >= fromDate &&
    reason.trim() !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    apply.mutate(
      { type, fromDate, toDate: effectiveTo, reason: reason.trim() },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply for OD / Leave</DialogTitle>
          <DialogDescription>
            Your class teacher approves first, then the HOD. Attendance is updated only after final
            approval.
          </DialogDescription>
        </DialogHeader>

        <form id="apply-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="leave-type">Type</Label>
            <FormSelect
              id="leave-type"
              value={type}
              onChange={(v) => setType(v as LeaveType)}
              options={LEAVE_TYPES}
              placeholder="Type"
            />
          </div>
          {/* Single day vs a range. Default single (the common case) — one date
              field, sent as both from/to. */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Duration</span>
            <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
              <button
                type="button"
                onClick={() => setMultiDay(false)}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  !multiDay
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Single day
              </button>
              <button
                type="button"
                onClick={() => setMultiDay(true)}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  multiDay
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Date range
              </button>
            </div>
          </div>
          <div className={multiDay ? "grid grid-cols-2 gap-4" : "flex flex-col gap-2"}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="from-date">{multiDay ? "From" : "Date"}</Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-10!"
                required
              />
            </div>
            {multiDay && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="to-date">To</Label>
                <Input
                  id="to-date"
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-10!"
                  required
                />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason">Reason</Label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              placeholder="e.g. Inter-college sports meet at ..."
              required
            />
          </div>

          {apply.isError && <FormError>{errorMessage(apply.error)}</FormError>}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={apply.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="apply-form" disabled={!valid || apply.isPending}>
            {apply.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
