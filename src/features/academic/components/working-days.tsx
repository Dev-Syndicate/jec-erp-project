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
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { FormError } from "@/components/form-error";
import { TABLE_FRAME } from "@/app/(app)/page-shell";
import { WEEKDAY_OPTIONS, type Weekday, type WorkingDay } from "@/features/academic/types";
import {
  useDeclareWorkingDay,
  useDeleteWorkingDay,
  useWorkingDays,
} from "@/features/academic/hooks/use-academic";

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
          <Input
            size="lg"
            id="wd-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
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
                      ? "bg-card font-medium text-foreground shadow-sm"
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
            size="lg"
            id="wd-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Pongal compensation"
            className="w-64"
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
        <FormError>{errorMessage(declare.error)}</FormError>
      )}

      <Table containerClassName={TABLE_FRAME} className="min-w-160">
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Runs</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Declared by</TableHead>
            <TableHead className="w-20 text-right">Remove</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.isPending ? (
            <TableEmpty colSpan={5}>Loading…</TableEmpty>
          ) : list.length === 0 ? (
            <TableEmpty colSpan={5}>
              No working Saturdays declared. Every Saturday is a holiday.
            </TableEmpty>
          ) : (
            list.map((w) => <Row key={w.id} day={w} onRemove={() => remove.mutate(w.id)} />)
          )}
        </TableBody>
      </Table>
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
    <TableRow>
      <TableCell className="font-medium">{prettyDate(day.date)}</TableCell>
      <TableCell>{WEEKDAY_LABEL[day.followsDay]}&apos;s timetable</TableCell>
      <TableCell className="text-muted-foreground">{day.note ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{day.declaredBy ?? "—"}</TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`Remove working Saturday ${day.date}`}
        >
          <Trash2 />
        </Button>
      </TableCell>
    </TableRow>
  );
}
