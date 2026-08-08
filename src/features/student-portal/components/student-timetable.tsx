// Student portal — the signed-in student's own weekly timetable, as its own page.
// The Overview keeps the "what's on today" strip; the full Mon–Fri grid lives
// here, because reading the whole week is a deliberate visit rather than
// something to scroll past on the dashboard.
//
// Data comes from the same self-scoped GET /api/me/overview the Overview uses
// (no client id), so the shared query cache serves this page without a second
// round-trip.
"use client";

import { FormError } from "@/components/form-error";
import { PageShell } from "@/app/(app)/page-shell";
import { useStudentOverview } from "@/features/student-portal/hooks/use-portal";
import type { PortalSlot, StudentOverview, Weekday } from "@/features/student-portal/types";

const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];
// Short for the column headers (they have to fit), full in prose.
const WEEKDAY_SHORT: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
};
const WEEKDAY_LABEL: Record<Weekday, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
};
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

export function StudentTimetable() {
  const { data, isLoading, isError, error } = useStudentOverview();

  if (isLoading) {
    return (
      <PageShell width="narrow">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted/60" />
        <div className="h-120 animate-pulse rounded-2xl bg-muted/40" />
      </PageShell>
    );
  }
  if (isError) {
    return (
      <PageShell width="narrow">
        <FormError>
          {error instanceof Error ? error.message : "Couldn't load your timetable."}
        </FormError>
      </PageShell>
    );
  }

  const o = data as StudentOverview;

  return (
    <PageShell width="narrow" className="gap-6">
      <header className="flex flex-col gap-1.5">
        <span className="eyebrow text-primary">
          {o.profile.classLabel ? `${o.profile.programLabel} · ${o.profile.classLabel}` : ""}
          {o.semesterLabel ? ` · ${o.semesterLabel}` : ""}
        </span>
        <h1 className="font-heading text-2xl font-semibold text-foreground md:text-3xl">
          My timetable
        </h1>
        <p className="text-sm text-muted-foreground">
          Your weekly class schedule for the active semester (Mon–Fri). A working Saturday follows
          one of these weekdays — your department announces which.
        </p>
      </header>

      {o.notEnrolled ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          You&apos;re not enrolled in a class for the active year yet. Your timetable will show here
          once you&apos;re placed.
        </p>
      ) : (
        <>
          {o.today.followsDay && (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary ring-1 ring-primary/15">
              Today is a working Saturday — the college is running{" "}
              {WEEKDAY_LABEL[o.today.followsDay]}&rsquo;s timetable, highlighted below.
            </p>
          )}
          <WeekGrid slots={o.timetable} todayKey={o.today.weekday} />
        </>
      )}
    </PageShell>
  );
}

// The full Mon–Fri grid. There is no Saturday column because no Saturday grid
// exists to show: the college does work some Saturdays, but a declared working
// Saturday RUNS one of these weekday grids (WorkingDay.followsDay, set by an
// admin), so the week below is still the whole timetable. Attendance is keyed on
// the actual date, not the day-of-week, so a borrowed grid records correctly.
function WeekGrid({ slots, todayKey }: { slots: PortalSlot[]; todayKey: Weekday | null }) {
  if (slots.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        No timetable published for your class yet.
      </p>
    );
  }
  const byCell = new Map(slots.map((s) => [`${s.dayOfWeek}-${s.period}`, s]));

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <table className="w-full min-w-160 border-collapse text-sm">
        <thead>
          <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
            <th className="w-14 px-3 py-2 font-medium">Period</th>
            {WEEKDAYS.map((d) => (
              <th
                key={d}
                className={`px-3 py-2 font-medium ${d === todayKey ? "text-primary" : ""}`}
              >
                {WEEKDAY_SHORT[d]}
                {d === todayKey && <span className="ml-1 text-[0.6rem]">• today</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((p) => (
            <tr key={p} className="h-16 border-b border-foreground/10 last:border-b-0">
              <td className="px-3 align-middle font-mono text-xs text-muted-foreground">P{p}</td>
              {WEEKDAYS.map((d) => {
                const slot = byCell.get(`${d}-${p}`);
                const isToday = d === todayKey;
                return (
                  <td key={d} className={`p-2 align-middle ${isToday ? "bg-primary/3" : ""}`}>
                    {slot ? (
                      <div className="flex flex-col rounded-md bg-primary/5 px-2 py-1.5 ring-1 ring-primary/15">
                        <span className="text-sm font-medium leading-tight">{slot.subjectCode}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {slot.facultyName}
                        </span>
                      </div>
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
  );
}
