// Attendance marking — mark a class's attendance for one (date, period).
//
// Flow: pick a Program → Class → Date. The weekday resolves from the date; a
// working Saturday borrows a weekday's timetable (a "follows" picker), Sunday is
// off. Then pick one of the day's scheduled periods and mark the roster. Saving
// period 1 also sets the day's official attendance (server-side). Super-Admin
// only (the API re-checks); program-scoped.
"use client";

import { useState } from "react";
import { CalendarCheck2, Check, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/app/(app)/page-header";
import { FormSelect } from "@/features/attendance/components/form-select";
import {
  STATUSES,
  WEEKDAYS,
  type AttendanceStatus,
  type DayPeriod,
  type RosterStudent,
  type RosterView,
  type Weekday,
} from "@/features/attendance/types";
import {
  useClassOptions,
  useRoster,
  useSaveAttendance,
} from "@/features/attendance/hooks/use-attendance";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
};

// Fixed (non-brand) status colors — attendance status encodes meaning, not theme.
const STATUS_META: Record<
  AttendanceStatus,
  { label: string; short: string; active: string }
> = {
  PRESENT: { label: "Present", short: "P", active: "border-emerald-600 bg-emerald-600 text-white" },
  ABSENT: { label: "Absent", short: "A", active: "border-red-600 bg-red-600 text-white" },
  OD: { label: "OD", short: "OD", active: "border-amber-500 bg-amber-500 text-white" },
  EXCUSED: { label: "Excused", short: "EX", active: "border-violet-600 bg-violet-600 text-white" },
};

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
function dayNameOf(dateStr: string): (typeof DOW)[number] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : DOW[d.getUTCDay()];
}

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
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

export function AttendanceManager() {
  const classes = useClassOptions();
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayStr);
  const [followsDay, setFollowsDay] = useState<Weekday | "">("");
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);

  const activeClasses = (classes.data ?? []).filter((c) => c.isActive);

  // Program options derived from the classes that exist — no extra endpoint.
  const programOptions = [
    ...new Map(activeClasses.map((c) => [c.programId, c.programLabel])).entries(),
  ].map(([id, label]) => ({ value: id, label }));

  const classesInProgram = activeClasses.filter((c) => c.programId === programId);

  const dn = dayNameOf(date);
  const isSat = dn === "SAT";
  const isSun = dn === "SUN";
  const needsFollows = isSat && followsDay === "";

  const queryEnabled = !!classId && !!date && !isSun && !needsFollows;
  const view = useRoster(
    classId || null,
    date,
    isSat && followsDay !== "" ? followsDay : undefined,
    queryEnabled,
  );

  const periods = view.data?.periods ?? [];
  const activePeriod = selectedPeriod ?? periods[0]?.period ?? null;
  const activePeriodInfo = periods.find((p) => p.period === activePeriod) ?? null;

  function resetPeriod() {
    setSelectedPeriod(null);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Attendance"
        title="Mark attendance"
        description="Pick a class and date, then mark the roster period by period. Marking period 1 also sets the day's overall attendance."
      />

      {/* Pickers */}
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Program">
          <div className="w-56">
            <FormSelect
              value={programId}
              onChange={(v) => {
                setProgramId(v);
                setClassId("");
                resetPeriod();
              }}
              options={programOptions}
              placeholder={classes.isPending ? "Loading…" : "Select a program"}
            />
          </div>
        </Field>

        <Field label="Class">
          <div className="w-40">
            <FormSelect
              value={classId}
              onChange={(v) => {
                setClassId(v);
                resetPeriod();
              }}
              options={classesInProgram.map((c) => ({ value: c.id, label: c.shortLabel }))}
              placeholder={
                programId === ""
                  ? "Pick a program first"
                  : classesInProgram.length === 0
                    ? "No classes"
                    : "Select a class"
              }
              disabled={programId === ""}
            />
          </div>
        </Field>

        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setFollowsDay("");
              resetPeriod();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>

        {isSat && (
          <Field label="Follows">
            <div className="w-40">
              <FormSelect
                value={followsDay}
                onChange={(v) => {
                  setFollowsDay(v as Weekday);
                  resetPeriod();
                }}
                options={WEEKDAYS.map((d) => ({ value: d, label: WEEKDAY_LABEL[d] }))}
                placeholder="Which weekday?"
              />
            </div>
          </Field>
        )}
      </div>

      {/* Saturday hint */}
      {isSat && (
        <p className="text-sm text-muted-foreground">
          Saturday isn&apos;t in the timetable. If the college is working, choose which weekday&apos;s
          timetable it follows — attendance is still recorded against this date.
        </p>
      )}

      {/* Body */}
      {isSun ? (
        <p className="text-sm text-muted-foreground">Sunday isn&apos;t a working day — nothing to mark.</p>
      ) : classId === "" ? (
        <p className="text-sm text-muted-foreground">Pick a program, then a class, to mark attendance.</p>
      ) : needsFollows ? (
        <p className="text-sm text-muted-foreground">
          Choose which weekday this Saturday follows to load the timetable.
        </p>
      ) : view.isPending ? (
        <p className="text-sm text-muted-foreground">Loading roster…</p>
      ) : view.isError ? (
        <FormError>{errorMessage(view.error)}</FormError>
      ) : view.data ? (
        <Loaded
          view={view.data}
          isSat={isSat}
          periods={periods}
          activePeriod={activePeriod}
          activePeriodInfo={activePeriodInfo}
          onSelectPeriod={setSelectedPeriod}
          followsDay={isSat && followsDay !== "" ? followsDay : undefined}
        />
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Loaded({
  view,
  isSat,
  periods,
  activePeriod,
  activePeriodInfo,
  onSelectPeriod,
  followsDay,
}: {
  view: RosterView;
  isSat: boolean;
  periods: DayPeriod[];
  activePeriod: number | null;
  activePeriodInfo: DayPeriod | null;
  onSelectPeriod: (p: number) => void;
  followsDay: Weekday | undefined;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{view.classLabel}</span>
        {" · "}
        {view.semesterLabel}
        {isSat && (
          <>
            {" · "}
            <span className="text-foreground">Follows {WEEKDAY_LABEL[view.weekday]}</span>
          </>
        )}
      </p>

      {view.roster.length === 0 ? (
        <FormError>
          No students are enrolled in this class for the active year. Enrol students under People →
          Students first.
        </FormError>
      ) : periods.length === 0 ? (
        <FormError>
          No periods are scheduled for {WEEKDAY_LABEL[view.weekday]}. Build the timetable under
          Curriculum → Timetable first.
        </FormError>
      ) : (
        <>
          {/* Period tabs */}
          <div className="flex flex-wrap gap-2">
            {periods.map((p) => {
              const active = p.period === activePeriod;
              return (
                <button
                  key={p.period}
                  type="button"
                  onClick={() => onSelectPeriod(p.period)}
                  className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span className="font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    Period {p.period}
                  </span>
                  <span className="text-sm font-medium">{p.subjectCode}</span>
                </button>
              );
            })}
          </div>

          {activePeriodInfo && (
            <PeriodMarker
              // Remount (reset local marks) when the target changes.
              key={`${view.classId}-${view.date}-${view.weekday}-${activePeriodInfo.period}`}
              classId={view.classId}
              date={view.date}
              followsDay={followsDay}
              period={activePeriodInfo}
              roster={view.roster}
              existing={view.marks.filter((m) => m.period === activePeriodInfo.period)}
            />
          )}
        </>
      )}
    </div>
  );
}

function PeriodMarker({
  classId,
  date,
  followsDay,
  period,
  roster,
  existing,
}: {
  classId: string;
  date: string;
  followsDay: Weekday | undefined;
  period: DayPeriod;
  roster: RosterStudent[];
  existing: Array<{ studentId: string; status: AttendanceStatus }>;
}) {
  // Initialize from any saved marks; default everyone Present (mark the absentees).
  const initial: Record<string, AttendanceStatus> = {};
  const saved = new Map(existing.map((m) => [m.studentId, m.status]));
  for (const s of roster) initial[s.studentId] = saved.get(s.studentId) ?? "PRESENT";

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(initial);
  const [savedOnce, setSavedOnce] = useState(false);
  const [query, setQuery] = useState("");
  const save = useSaveAttendance();

  const setAll = (status: AttendanceStatus) =>
    setStatuses(Object.fromEntries(roster.map((s) => [s.studentId, status])));
  const setOne = (studentId: string, status: AttendanceStatus) =>
    setStatuses((prev) => ({ ...prev, [studentId]: status }));

  const counts = STATUSES.map((st) => ({
    status: st,
    n: roster.filter((s) => statuses[s.studentId] === st).length,
  }));

  // Search is DISPLAY-ONLY — keep each student's original roster number and
  // always submit the full roster (statuses is keyed by every studentId), so
  // filtering can never drop someone's mark.
  const q = query.trim().toLowerCase();
  const visible = roster
    .map((s, i) => ({ s, n: i + 1 }))
    .filter(
      ({ s }) =>
        q === "" ||
        s.registerNumber.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q) ||
        (s.rollNumber ?? "").toLowerCase().includes(q),
    );

  function submit() {
    save.mutate(
      {
        classId,
        date,
        period: period.period,
        followsDay,
        entries: roster.map((s) => ({ studentId: s.studentId, status: statuses[s.studentId] })),
      },
      { onSuccess: () => setSavedOnce(true) },
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl ring-1 ring-foreground/10">
      {/* Period header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/10 bg-muted/40 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            Period {period.period} · {period.subjectCode} — {period.subjectName}
          </span>
          <span className="text-xs text-muted-foreground">
            {period.facultyName}
            {period.period === 1 && " · also sets today's overall attendance"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {counts.map((c) => (
            <span
              key={c.status}
              className="rounded-md border border-border px-2 py-1 font-mono text-muted-foreground"
            >
              {STATUS_META[c.status].short} {c.n}
            </span>
          ))}
        </div>
      </div>

      {/* Bulk + roster */}
      <div className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Set all:</span>
            {STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setAll(st)}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
              >
                {STATUS_META[st].label}
              </button>
            ))}
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or register no.…"
              aria-label="Search roster"
              className="h-9! pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <table className="w-full min-w-140 border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
                <th className="w-10 px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Register no.</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No students match “{query.trim()}”.
                  </td>
                </tr>
              ) : (
                visible.map(({ s, n }) => (
                  <tr key={s.studentId} className="border-b border-foreground/10 last:border-b-0">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{n}</td>
                    <td className="px-3 py-2 font-mono text-xs">{s.registerNumber}</td>
                    <td className="px-3 py-2">{s.displayName}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {STATUSES.map((st) => {
                          const active = statuses[s.studentId] === st;
                          return (
                            <button
                              key={st}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setOne(s.studentId, st)}
                              className={`min-w-9 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                                active
                                  ? STATUS_META[st].active
                                  : "border-border text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {STATUS_META[st].short}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center justify-between gap-3 border-t border-foreground/10 px-4 py-3">
        <div className="text-sm text-muted-foreground">
          {save.isError ? (
            <span className="text-destructive">{errorMessage(save.error)}</span>
          ) : savedOnce && !save.isPending ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-600">
              <Check className="size-4" /> Saved
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CalendarCheck2 className="size-4" /> {roster.length} students
            </span>
          )}
        </div>
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save attendance"}
        </Button>
      </div>
    </div>
  );
}
