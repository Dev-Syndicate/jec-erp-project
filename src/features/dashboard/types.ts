// Types owned by the staff Dashboard — the signed-in staff member's live Overview
// (today's classes, whether they advise a class, and an admin snapshot). Kept local
// (no cross-feature imports).

export type TodayClass = {
  period: number;
  subjectCode: string;
  subjectName: string;
  classId: string;
  classShort: string; // "II-A"
};

export type StaffOverview = {
  date: string | null;
  weekend: boolean;
  semesterLabel: string | null;
  todayClasses: TodayClass[];
  advisesClass: boolean;
  teaches: boolean; // has ≥1 timetable slot this semester (gates My timetable)
  stats: { students: number; faculty: number; classes: number } | null; // admin only
};

// ---------------------------------------------------------------------------
// Dashboard analytics (GET /api/dashboard/analytics) — the numbers behind the
// staff Dashboard's KPI row and charts. Additive: StaffOverview above is
// unchanged and still owns "who am I / what am I teaching today".
//
// Every optional-looking `number | null` is deliberate. Null means "not
// derivable from the data yet" (no records, no prior year, no second window)
// and the UI renders an em dash rather than a zero — a 0% attendance rate and
// an unmeasured one are very different statements.
// ---------------------------------------------------------------------------

export type TrendPoint = {
  date: string; // "YYYY-MM-DD"
  attended: number;
  total: number;
  pct: number;
};

export type ClassStanding = {
  classId: string;
  label: string; // "CSE II-A"
  year: number;
  students: number;
  attended: number;
  total: number;
  pct: number | null;
};

export type AttendanceBand = {
  key: string;
  label: string;
  students: number;
};

export type DashboardHeadline = {
  students: number;
  studentsPrior: number | null;
  priorYearName: string | null;
  faculty: number;
  classes: number;
  attendancePct: number | null;
  attendanceDays: number;
  recentPct: number | null;
  priorPct: number | null;
  atRisk: number;
  atRiskOf: number;
  pendingTeacher: number;
  pendingHod: number;
  scheduledToday: number;
  markedToday: number;
  isWorkingDay: boolean;
  /** Today's day-attendance. `null` when no register has been taken yet. */
  todayPct: number | null;
  todayAttended: number;
  todayTotal: number;
};

export type AdminAnalytics = {
  threshold: number;
  window: number;
  /**
   * True for an institution-scoped viewer (Super Admin). They sit outside the
   * leave/OD chain — approvals are the class teacher's then the HOD's — so the
   * pending-approvals tile is hidden for them and shown to HODs.
   */
  unscoped: boolean;
  headline: DashboardHeadline;
  composition: {
    present: number;
    absent: number;
    od: number;
    excused: number;
    total: number;
    attended: number;
  };
  trend: TrendPoint[];
  classes: ClassStanding[];
  yearMix: Array<{ year: number; label: string; students: number }>;
  bands: AttendanceBand[];
};

export type DashboardAnalytics = {
  semesterLabel: string | null;
  scopeLabel: string;
  noActiveSemester: boolean;
  /** Null for staff without the manage-Student capability. */
  admin: AdminAnalytics | null;
  /** Which of the caller's own hours today already have a register. */
  teaching: { markedToday: Array<{ classId: string; period: number }> } | null;
};
