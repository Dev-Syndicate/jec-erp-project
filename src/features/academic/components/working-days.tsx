// Working Saturdays — declare which Saturdays the college works and whose
// timetable each one runs. Super Admin only (the API re-checks).
//
// Why this exists: the timetable is Mon–Fri, so a working Saturday has to borrow
// a weekday's grid. That used to be a dropdown on the attendance screen, chosen
// per teacher per marking session — two teachers could pick different weekdays
// for the same date and nothing flagged it. Declaring it once here makes it one
// answer per date, recorded and auditable.
"use client";

import { useState } from "react";
import { CalendarPlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEEKDAY_OPTIONS, type Weekday, type WorkingDay } from "@/features/academic/types";
import {
  useDeclareWorkingDay,
  useDeleteWorkingDay,
  useWorkingDays,
} from "@/features/academic/hooks/use-academic";

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

/** Is this yyyy-mm-dd string a Saturday? Only Saturdays can be declared. */
function isSaturday(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 6;
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function WorkingDays() {
  const days = useWorkingDays();
  const declare = useDeclareWorkingDay();
  const remove = useDeleteWorkingDay();

  const [date, setDate] = useState("");
  const [followsDay, setFollowsDay] = useState<Weekday | "">("");
  const [note, setNote] = useState("");

  // Guide the admin before the server has to: only a Saturday is declarable.
  const dateChosen = date !== "";
  const dateIsSat = isSaturday(date);
  const valid = dateIsSat && followsDay !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    declare.mutate(
      { date, followsDay: followsDay as Weekday, note: note.trim() || null },
      {
        onSuccess: () => {
          setDate("");
          setFollowsDay("");
          setNote("");
        },
      },
    );
  }

  const list = days.data?.workingDays ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-medium">Working Saturdays</h2>
        <p className="text-sm text-muted-foreground">
          The timetable runs Monday–Friday. When the college works a Saturday, declare which
          weekday&apos;s timetable it follows — every teacher marking that date then sees the same
          periods. A Saturday that isn&apos;t listed here is a holiday and can&apos;t be marked.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="wd-date">Saturday</Label>
          <input
            id="wd-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {/* Five options, all worth seeing at once — a segmented row reads faster
            than a dropdown and makes the choice obvious. */}
        <div className="flex flex-col gap-2">
          <Label>Follows</Label>
          <div
            role="radiogroup"
            aria-label="Which weekday's timetable"
            className="inline-flex gap-1 rounded-lg border border-border bg-muted/40 p-1"
          >
            {WEEKDAY_OPTIONS.map((d) => {
              const active = followsDay === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFollowsDay(d.value)}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                    active
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.label.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wd-note">Note (optional)</Label>
          <Input
            id="wd-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Pongal compensation"
            className="h-10! w-64"
          />
        </div>
        <Button type="submit" data-icon="inline-start" disabled={!valid || declare.isPending}>
          <CalendarPlus />
          {declare.isPending ? "Declaring…" : "Declare"}
        </Button>
      </form>

      {dateChosen && !dateIsSat && (
        <p className="text-sm text-destructive">
          Pick a Saturday — Monday to Friday already run their own timetable.
        </p>
      )}
      {declare.isError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {errorMessage(declare.error)}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-160 border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Runs</th>
              <th className="px-3 py-2 font-medium">Note</th>
              <th className="px-3 py-2 font-medium">Declared by</th>
              <th className="w-20 px-3 py-2 text-right font-medium">Remove</th>
            </tr>
          </thead>
          <tbody>
            {days.isPending ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No working Saturdays declared. Every Saturday is a holiday.
                </td>
              </tr>
            ) : (
              list.map((w) => <Row key={w.id} day={w} onRemove={() => remove.mutate(w.id)} />)
            )}
          </tbody>
        </table>
      </div>
      {remove.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(remove.error)}
        </p>
      )}
    </section>
  );
}

function Row({ day, onRemove }: { day: WorkingDay; onRemove: () => void }) {
  return (
    <tr className="border-b border-foreground/10 last:border-b-0">
      <td className="px-3 py-2 font-medium">{prettyDate(day.date)}</td>
      <td className="px-3 py-2">{WEEKDAY_LABEL[day.followsDay]}&apos;s timetable</td>
      <td className="px-3 py-2 text-muted-foreground">{day.note ?? "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{day.declaredBy ?? "—"}</td>
      <td className="px-3 py-2 text-right">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`Remove working Saturday ${day.date}`}
        >
          <Trash2 />
        </Button>
      </td>
    </tr>
  );
}
