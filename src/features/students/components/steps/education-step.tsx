// Educational Info step — repeatable education records (school / college /
// entrance). Add as many as needed; each row's fields vary by level (college
// shows GPA + MPC totals, entrance shows rank). Optional: zero records is valid.
// Saved as a set via PUT …/admission/education (replace-all).
"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSaveEducation } from "@/features/students/hooks/use-students";
import type { EducationInput, EducationLevel, StudentDetail } from "@/features/students/types";
import { Field, SaveBar } from "@/features/students/components/steps/step-ui";

const LEVELS: { value: EducationLevel; label: string }[] = [
  { value: "SCHOOL", label: "School" },
  { value: "COLLEGE", label: "College" },
  { value: "ENTRANCE", label: "Entrance exam" },
];

function emptyRecord(level: EducationLevel): EducationInput {
  return {
    level,
    instituteName: "",
    board: "",
    yearOfPassing: "",
    hallTicketNo: "",
    marks: "",
    percentage: "",
    gpa: "",
    totalMPC: "",
    obtainedMPC: "",
    rank: "",
  };
}

function initialRecords(student: StudentDetail | undefined): EducationInput[] {
  const rows = student?.education ?? [];
  if (!rows.length) return [];
  return rows.map((r) => ({
    level: r.level,
    instituteName: r.instituteName,
    board: r.board ?? "",
    yearOfPassing: r.yearOfPassing != null ? String(r.yearOfPassing) : "",
    hallTicketNo: r.hallTicketNo ?? "",
    marks: r.marks ?? "",
    percentage: r.percentage ?? "",
    gpa: r.gpa ?? "",
    totalMPC: r.totalMPC != null ? String(r.totalMPC) : "",
    obtainedMPC: r.obtainedMPC != null ? String(r.obtainedMPC) : "",
    rank: r.rank != null ? String(r.rank) : "",
  }));
}

export function EducationStep({
  studentId,
  student,
}: {
  studentId: string;
  student: StudentDetail | undefined;
}) {
  const save = useSaveEducation(studentId);
  const [records, setRecords] = useState<EducationInput[]>(() => initialRecords(student));
  const [saved, setSaved] = useState(false);

  const add = (level: EducationLevel) => {
    setRecords((rs) => [...rs, emptyRecord(level)]);
    setSaved(false);
  };
  const remove = (i: number) => {
    setRecords((rs) => rs.filter((_, j) => j !== i));
    setSaved(false);
  };
  const patch = (i: number, p: Partial<EducationInput>) => {
    setRecords((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
    setSaved(false);
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(records, { onSuccess: () => setSaved(true) });
      }}
    >
      {records.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No education records yet. Add school, college or entrance-exam entries below.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {records.map((r, i) => (
          <RecordCard
            key={i}
            index={i}
            record={r}
            onChange={(p) => patch(i, p)}
            onRemove={() => remove(i)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l) => (
          <Button key={l.value} type="button" variant="outline" size="sm" onClick={() => add(l.value)}>
            <Plus className="size-4" />
            Add {l.label.toLowerCase()}
          </Button>
        ))}
      </div>

      <SaveBar pending={save.isPending} saved={saved} error={save.error} label="Save education" />
    </form>
  );
}

function RecordCard({
  index,
  record,
  onChange,
  onRemove,
}: {
  index: number;
  record: EducationInput;
  onChange: (p: Partial<EducationInput>) => void;
  onRemove: () => void;
}) {
  const isCollege = record.level === "COLLEGE";
  const isEntrance = record.level === "ENTRANCE";

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <legend className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          {LEVELS.find((l) => l.value === record.level)?.label} · {index + 1}
        </legend>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remove this record"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={isEntrance ? "Exam name" : "Institute name"}>
          <Input value={record.instituteName} onChange={(e) => onChange({ instituteName: e.target.value })} className="h-10" required />
        </Field>

        {!isEntrance && (
          <Field label="Board / University" optional>
            <Input value={record.board} onChange={(e) => onChange({ board: e.target.value })} className="h-10" />
          </Field>
        )}

        <Field label="Year of passing" optional>
          <Input value={record.yearOfPassing} onChange={(e) => onChange({ yearOfPassing: e.target.value })} className="h-10" inputMode="numeric" placeholder="2024" />
        </Field>

        <Field label="Hall ticket no" optional>
          <Input value={record.hallTicketNo} onChange={(e) => onChange({ hallTicketNo: e.target.value })} className="h-10" />
        </Field>

        {!isEntrance && (
          <>
            <Field label="Marks" optional>
              <Input value={record.marks} onChange={(e) => onChange({ marks: e.target.value })} className="h-10" placeholder="e.g. 540/600" />
            </Field>
            <Field label="Percentage" optional>
              <Input value={record.percentage} onChange={(e) => onChange({ percentage: e.target.value })} className="h-10" inputMode="decimal" />
            </Field>
          </>
        )}

        {isCollege && (
          <>
            <Field label="GPA" optional>
              <Input value={record.gpa} onChange={(e) => onChange({ gpa: e.target.value })} className="h-10" inputMode="decimal" />
            </Field>
            <Field label="Total MPC" optional>
              <Input value={record.totalMPC} onChange={(e) => onChange({ totalMPC: e.target.value })} className="h-10" inputMode="numeric" />
            </Field>
            <Field label="Obtained MPC" optional>
              <Input value={record.obtainedMPC} onChange={(e) => onChange({ obtainedMPC: e.target.value })} className="h-10" inputMode="numeric" />
            </Field>
          </>
        )}

        {isEntrance && (
          <Field label="Rank / CRL" optional>
            <Input value={record.rank} onChange={(e) => onChange({ rank: e.target.value })} className="h-10" inputMode="numeric" />
          </Field>
        )}
      </div>
    </fieldset>
  );
}
