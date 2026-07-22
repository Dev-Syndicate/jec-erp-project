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
  stats: { students: number; faculty: number; classes: number } | null; // admin only
};
