// Types owned by the Leave/OD feature — a student's request + the approver's queue.
// Kept local (features don't import each other).

export type LeaveType = "OD" | "LEAVE";
export type LeaveStatus = "PENDING_TEACHER" | "PENDING_HOD" | "APPROVED" | "REJECTED";

export type LeaveRequest = {
  id: string;
  type: LeaveType;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  reason: string;
  status: LeaveStatus;
  rejectionReason: string | null;
  classId: string;
  classLabel: string;
  student: { registerNumber: string; rollNumber: string | null; displayName: string };
  teacherActionBy: string | null;
  teacherActionAt: string | null; // ISO
  hodActionBy: string | null;
  hodActionAt: string | null; // ISO
  createdAt: string; // ISO
  // May the current viewer act on THIS request at its current stage? False for an
  // HOD looking at a request still awaiting the class teacher.
  actionable: boolean;
};

export type LeaveListView = {
  canApprove: boolean;
  isStudent: boolean;
  requests: LeaveRequest[];
};

export type ApplyLeaveInput = {
  type: LeaveType;
  fromDate: string;
  toDate: string;
  reason: string;
};

export type LeaveAction =
  | { action: "approve" }
  | { action: "reject"; rejectionReason: string };

export const LEAVE_TYPES: Array<{ value: LeaveType; label: string }> = [
  { value: "OD", label: "On-Duty (OD)" },
  { value: "LEAVE", label: "Leave" },
];

// Human labels + which workflow stage each status sits at.
export const STATUS_META: Record<
  LeaveStatus,
  { label: string; tone: "pending" | "approved" | "rejected" }
> = {
  PENDING_TEACHER: { label: "Awaiting class teacher", tone: "pending" },
  PENDING_HOD: { label: "Awaiting HOD", tone: "pending" },
  APPROVED: { label: "Approved", tone: "approved" },
  REJECTED: { label: "Rejected", tone: "rejected" },
};
