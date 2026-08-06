// My timetable — the signed-in staff member's weekly teaching schedule for the
// active semester, as a grid of periods (rows) × weekdays (Mon–Fri, columns).
// Read-only reference; a working Saturday borrows one of these weekday grids.
"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { errorMessage } from "@/lib/errors";
import { FormError } from "@/components/form-error";
import { PageShell } from "@/app/(app)/page-shell";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/app/(app)/page-header";
import {
  WEEKDAYS,
  type MyTimetableSlot,
  type Weekday,
} from "@/features/attendance/types";
import { useMyTimetable } from "@/features/attendance/hooks/use-attendance";

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
    <PageShell>
      <PageHeader
        eyebrow="Attendance · Schedule"
        title="My timetable"
        description="Your weekly teaching schedule for the active semester (Mon–Fri). A working Saturday follows one of these weekdays."
      />

      {tt.isPending ? (
        <LoadingState label="Loading your timetable…" />
      ) : tt.isError ? (
        <FormError>{errorMessage(tt.error)}</FormError>
      ) : slots.length === 0 ? (
        <EmptyState size="sm" title="You have no scheduled periods this semester." />
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
                  // Fixed row height + centered content so every period row is the
                  // same size, whether or not the hour has a class.
                  <tr key={p} className="h-20 border-b border-foreground/10 last:border-b-0">
                    <td className="px-3 align-middle font-mono text-xs text-muted-foreground">P{p}</td>
                    {WEEKDAYS.map((d) => {
                      const slot = byCell.get(`${d}-${p}`);
                      return (
                        <td key={d} className="p-2 align-middle">
                          {slot ? (
                            <Cell slot={slot} />
                          ) : (
                            <span className="flex justify-center text-muted-foreground/40">—</span>
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
    </PageShell>
  );
}

function Cell({ slot }: { slot: MyTimetableSlot }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-primary/5 px-2 py-1.5 ring-1 ring-primary/15">
      <span className="flex items-center gap-1.5 text-sm font-medium leading-tight">
        {slot.subjectCode}
        {slot.isLab && (
          <span className="rounded bg-primary/15 px-1 py-px font-mono text-[0.6rem] font-semibold uppercase tracking-wide text-primary">
            Lab
          </span>
        )}
      </span>
      <span className="text-xs leading-tight text-foreground/80">{slot.subjectName}</span>
      <span className="text-[0.7rem] text-muted-foreground">{slot.classShort}</span>
    </div>
  );
}
