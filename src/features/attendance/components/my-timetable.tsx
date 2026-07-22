// My timetable — the signed-in staff member's weekly teaching schedule for the
// active semester, as a grid of periods (rows) × weekdays (Mon–Fri, columns).
// Read-only reference; a working Saturday borrows one of these weekday grids.
"use client";

import { PageHeader } from "@/app/(app)/page-header";
import {
  WEEKDAYS,
  type MyTimetableSlot,
  type Weekday,
} from "@/features/attendance/types";
import { useMyTimetable } from "@/features/attendance/hooks/use-attendance";

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

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
};

// A college day runs up to 8 periods (matches the marking grid).
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

export function MyTimetable() {
  const tt = useMyTimetable();
  const slots = tt.data?.slots ?? [];
  const byCell = new Map(slots.map((s) => [`${s.dayOfWeek}-${s.period}`, s]));

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Attendance · Schedule"
        title="My timetable"
        description="Your weekly teaching schedule for the active semester (Mon–Fri). A working Saturday follows one of these weekdays."
      />

      {tt.isPending ? (
        <p className="text-sm text-muted-foreground">Loading your timetable…</p>
      ) : tt.isError ? (
        <FormError>{errorMessage(tt.error)}</FormError>
      ) : slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You have no scheduled periods this semester.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {tt.data?.semesterLabel && (
            <p className="text-sm text-muted-foreground">{tt.data.semesterLabel}</p>
          )}
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <table className="w-full min-w-180 border-collapse text-sm">
              <thead>
                <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
                  <th className="w-16 px-3 py-2 font-medium">Period</th>
                  {WEEKDAYS.map((d) => (
                    <th key={d} className="px-3 py-2 font-medium">
                      {WEEKDAY_LABEL[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map((p) => (
                  <tr key={p} className="border-b border-foreground/10 last:border-b-0">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">P{p}</td>
                    {WEEKDAYS.map((d) => {
                      const slot = byCell.get(`${d}-${p}`);
                      return (
                        <td key={d} className="px-2 py-1.5 align-top">
                          {slot ? (
                            <Cell slot={slot} />
                          ) : (
                            <span className="px-1 text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ slot }: { slot: MyTimetableSlot }) {
  return (
    <div className="flex flex-col rounded-md bg-primary/5 px-2 py-1.5 ring-1 ring-primary/15">
      <span className="text-sm font-medium">{slot.subjectCode}</span>
      <span className="truncate text-xs text-muted-foreground" title={slot.subjectName}>
        {slot.classShort}
      </span>
    </div>
  );
}
