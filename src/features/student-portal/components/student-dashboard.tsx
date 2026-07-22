// Student portal — the signed-in student's own overview: profile, attendance %
// (overall + per-subject), their class timetable, and internal marks. All data is
// self-scoped server-side (GET /api/me/overview). This renders in place of the
// staff "Overview" for a student.
"use client";

import { useStudentOverview } from "@/features/student-portal/hooks/use-portal";
import type {
  PortalSlot,
  StudentOverview,
  SubjectMarks,
  Weekday,
} from "@/features/student-portal/types";

const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];
const WEEKDAY_LABEL: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
};
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

// Attendance is meaningful, so colour the % — colleges need 75%. Green ≥75,
// amber 65–74, red below.
function pctTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 75) return "text-emerald-600";
  if (pct >= 65) return "text-amber-600";
  return "text-destructive";
}
function barTone(pct: number | null): string {
  if (pct === null) return "bg-muted-foreground/30";
  if (pct >= 75) return "bg-emerald-500";
  if (pct >= 65) return "bg-amber-500";
  return "bg-destructive";
}

export function StudentDashboard() {
  const { data, isPending, isError, error } = useStudentOverview();

  if (isPending) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <p className="text-sm text-muted-foreground">Loading your dashboard…</p>
      </main>
    );
  }
  if (isError) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error instanceof Error ? error.message : "Couldn't load your dashboard."}
        </p>
      </main>
    );
  }

  const o = data as StudentOverview;
  const firstName = o.profile.displayName.split(" ")[0];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-primary">
          {o.profile.registerNumber}
          {o.profile.classLabel ? ` · ${o.profile.programLabel} · ${o.profile.classLabel}` : ""}
          {o.semesterLabel ? ` · ${o.semesterLabel}` : ""}
        </span>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Hello, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Your attendance, timetable and marks for the current semester.
        </p>
      </header>

      {o.notEnrolled ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          You&apos;re not enrolled in a class for the active year yet. Your attendance, timetable and
          marks will show here once you&apos;re placed.
        </p>
      ) : (
        <>
          <Attendance overall={o.attendance.overall} subjects={o.attendance.subjects} />
          <Timetable slots={o.timetable} />
          <Marks marks={o.marks} />
        </>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Attendance({
  overall,
  subjects,
}: {
  overall: StudentOverview["attendance"]["overall"];
  subjects: StudentOverview["attendance"]["subjects"];
}) {
  return (
    <Section title="Attendance">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Overall */}
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
          <span className="text-xs font-medium text-muted-foreground">Overall</span>
          <span className={`font-heading text-4xl font-semibold ${pctTone(overall?.pct ?? null)}`}>
            {overall?.pct === null || overall === null ? "—" : `${overall.pct}%`}
          </span>
          <span className="text-xs text-muted-foreground">
            {overall && overall.total > 0
              ? `${overall.attended} of ${overall.total} days present`
              : "No attendance recorded yet"}
          </span>
        </div>

        {/* Per subject */}
        <div className="lg:col-span-2">
          {subjects.length === 0 ? (
            <div className="flex h-full items-center rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No subject attendance recorded yet.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-foreground/10 rounded-xl ring-1 ring-foreground/10">
              {subjects.map((s) => (
                <div key={s.subjectId} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-mono text-xs">{s.code}</span>
                    <span className="truncate text-xs text-muted-foreground">{s.name}</span>
                  </div>
                  <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block">
                    <div
                      className={`h-full ${barTone(s.pct)}`}
                      style={{ width: `${s.pct ?? 0}%` }}
                    />
                  </div>
                  <span className={`w-16 text-right font-mono text-sm ${pctTone(s.pct)}`}>
                    {s.pct === null ? "—" : `${s.pct}%`}
                  </span>
                  <span className="w-16 text-right text-xs text-muted-foreground">
                    {s.attended}/{s.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function Timetable({ slots }: { slots: PortalSlot[] }) {
  const byCell = new Map(slots.map((s) => [`${s.dayOfWeek}-${s.period}`, s]));
  return (
    <Section title="Timetable">
      {slots.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          No timetable published for your class yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full min-w-160 border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
                <th className="w-14 px-3 py-2 font-medium">Period</th>
                {WEEKDAYS.map((d) => (
                  <th key={d} className="px-3 py-2 font-medium">
                    {WEEKDAY_LABEL[d]}
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
                    return (
                      <td key={d} className="p-2 align-middle">
                        {slot ? (
                          <div className="flex flex-col rounded-md bg-primary/5 px-2 py-1.5 ring-1 ring-primary/15">
                            <span className="text-sm font-medium leading-tight">{slot.subjectCode}</span>
                            <span className="truncate text-xs text-muted-foreground">{slot.facultyName}</span>
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
      )}
    </Section>
  );
}

function Marks({ marks }: { marks: SubjectMarks[] }) {
  return (
    <Section title="Internal marks">
      {marks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          No marks published yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {marks.map((m) => (
            <div
              key={m.subjectId}
              className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 ring-1 ring-foreground/10"
            >
              <div className="flex min-w-40 flex-col">
                <span className="font-mono text-xs">{m.code}</span>
                <span className="truncate text-xs text-muted-foreground">{m.name}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {m.items.map((it) => (
                  <span
                    key={it.assessment}
                    className="rounded-md border border-border px-2 py-1 text-xs"
                  >
                    <span className="font-mono text-muted-foreground">{it.assessment}</span>{" "}
                    <span className="font-medium">
                      {it.obtained}
                      <span className="text-muted-foreground">/{it.maxMark}</span>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
