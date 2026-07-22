// Promotion — advance a whole class's roster to the next year (or graduate a
// final-year class) in one action. Pick Program → Class; the screen loads the
// active-year roster and, unless it's the final year, a target academic year +
// target class (defaulting to the next year, same section). Tick who advances,
// then Promote/Graduate. Super-Admin only (the API re-checks).
"use client";

import { useState } from "react";
import { Check, GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/app/(app)/page-header";
import { FormSelect } from "@/features/promotion/components/form-select";
import type { PromotionContext, PromotionResult } from "@/features/promotion/types";
import {
  useClassOptions,
  usePromotionContext,
  useRunPromotion,
} from "@/features/promotion/hooks/use-promotion";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

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

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function PromotionManager() {
  const classes = useClassOptions();
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");

  const activeClasses = (classes.data ?? []).filter((c) => c.isActive);
  const programOptions = [
    ...new Map(activeClasses.map((c) => [c.programId, c.programLabel])).entries(),
  ].map(([id, label]) => ({ value: id, label }));
  const classesInProgram = activeClasses.filter((c) => c.programId === programId);

  const ctx = usePromotionContext(classId || null);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Academic · Promotion"
        title="Promote students"
        description="Advance a class to next year, or graduate a final-year class. Each student gets a new enrollment for the target year; old ones stay as history."
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Program</span>
          <div className="w-56">
            <FormSelect
              value={programId}
              onChange={(v) => {
                setProgramId(v);
                setClassId("");
              }}
              options={programOptions}
              placeholder={classes.isPending ? "Loading…" : "Select a program"}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Class</span>
          <div className="w-40">
            <FormSelect
              value={classId}
              onChange={setClassId}
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
        </div>
      </div>

      {classId === "" ? (
        <p className="text-sm text-muted-foreground">Pick a program, then a class, to promote it.</p>
      ) : ctx.isPending ? (
        <p className="text-sm text-muted-foreground">Loading roster…</p>
      ) : ctx.isError ? (
        <FormError>{errorMessage(ctx.error)}</FormError>
      ) : ctx.data ? (
        <PromotionPanel key={classId} context={ctx.data} />
      ) : null}
    </div>
  );
}

function PromotionPanel({ context }: { context: PromotionContext }) {
  const run = useRunPromotion();
  const { sourceClass, activeYear, targetYears, suggestedTargetYearId, targetClasses, suggestedTargetClassId, roster } =
    context;
  const graduate = sourceClass.isFinalYear;

  const [targetYearId, setTargetYearId] = useState(suggestedTargetYearId ?? "");
  const [targetClassId, setTargetClassId] = useState(suggestedTargetClassId ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(roster.map((r) => r.studentId)));
  const [result, setResult] = useState<PromotionResult | null>(null);

  const allSelected = roster.length > 0 && selected.size === roster.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(roster.map((r) => r.studentId)));

  const targetClassLabel = targetClasses.find((c) => c.id === targetClassId);
  const targetYearName = targetYears.find((y) => y.id === targetYearId)?.name;

  const missingNextYear = !graduate && targetYears.length === 0;
  const missingTargetClasses = !graduate && targetClasses.length === 0;
  const canRun =
    selected.size > 0 &&
    (graduate || (targetYearId !== "" && targetClassId !== "" && !missingNextYear && !missingTargetClasses));

  function submit() {
    run.mutate(
      {
        sourceClassId: sourceClass.id,
        mode: graduate ? "GRADUATE" : "PROMOTE",
        targetYearId: graduate ? undefined : targetYearId,
        targetClassId: graduate ? undefined : targetClassId,
        studentIds: [...selected],
      },
      { onSuccess: (data) => setResult(data) },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary line */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-foreground">{sourceClass.label}</span>
        <span className="text-muted-foreground">· {activeYear.name}</span>
        {graduate ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-status-od/10 px-2 py-0.5 text-xs font-medium text-status-od">
            <GraduationCap className="size-3.5" /> Final year — graduate
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Promote to Year {roman(sourceClass.year + 1)}
          </span>
        )}
      </div>

      {/* Target pickers (promotion only) */}
      {!graduate && (
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Target academic year</span>
            <div className="w-48">
              <FormSelect
                value={targetYearId}
                onChange={setTargetYearId}
                options={targetYears.map((y) => ({ value: y.id, label: y.name }))}
                placeholder={targetYears.length === 0 ? "No other year" : "Select year"}
                disabled={targetYears.length === 0}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Target class</span>
            <div className="w-40">
              <FormSelect
                value={targetClassId}
                onChange={setTargetClassId}
                options={targetClasses.map((c) => ({ value: c.id, label: `${roman(c.year)}-${c.section}` }))}
                placeholder={targetClasses.length === 0 ? "No next-year class" : "Select class"}
                disabled={targetClasses.length === 0}
              />
            </div>
          </div>
        </div>
      )}

      {missingNextYear && (
        <Note>
          There&apos;s no other academic year to promote into. Create the next year under{" "}
          <span className="font-medium text-foreground">Academic → Years &amp; semesters</span> first.
        </Note>
      )}
      {missingTargetClasses && (
        <Note>
          No Year {roman(sourceClass.year + 1)} classes exist in this program. Create them under{" "}
          <span className="font-medium text-foreground">Structure → Classes</span> first.
        </Note>
      )}

      {/* Roster */}
      {roster.length === 0 ? (
        <Note>No active students are enrolled in this class for {activeYear.name}.</Note>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full min-w-140 border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="size-4 accent-primary"
                  />
                </th>
                <th className="px-3 py-2 font-medium">Register no.</th>
                <th className="px-3 py-2 font-medium">Name</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => (
                <tr key={s.studentId} className="border-b border-foreground/10 last:border-b-0">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(s.studentId)}
                      onChange={() => toggle(s.studentId)}
                      aria-label={`Select ${s.displayName}`}
                      className="size-4 accent-primary"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{s.registerNumber}</td>
                  <td className="px-3 py-2">{s.displayName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {result ? (
            <span className="inline-flex items-center gap-1.5 text-status-present">
              <Check className="size-4" />
              {result.mode === "GRADUATE"
                ? `Graduated ${result.processed} student${result.processed === 1 ? "" : "s"}.`
                : `Promoted ${result.processed} student${result.processed === 1 ? "" : "s"}${
                    targetClassLabel ? ` to ${roman(targetClassLabel.year)}-${targetClassLabel.section}` : ""
                  }${targetYearName ? ` for ${targetYearName}` : ""}.`}
            </span>
          ) : run.isError ? (
            <span className="text-destructive">{errorMessage(run.error)}</span>
          ) : (
            <span>
              {selected.size} of {roster.length} selected
            </span>
          )}
        </div>
        <Button
          onClick={submit}
          disabled={!canRun || run.isPending}
          variant={graduate ? "outline" : "default"}
        >
          {run.isPending
            ? "Working…"
            : graduate
              ? `Graduate ${selected.size} student${selected.size === 1 ? "" : "s"}`
              : `Promote ${selected.size} student${selected.size === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
