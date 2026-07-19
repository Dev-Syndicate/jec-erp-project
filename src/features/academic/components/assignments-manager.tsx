// Teacher assignments — for the ACTIVE term, assign "Teacher T teaches Subject S
// to Section X." This is what authorizes attendance marking. Super Admin picks a
// department; an HOD is pinned to their own. Requires an active term and some
// classes/sections + subjects already set up.
"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DepartmentSelect, type DepartmentPickOption } from "@/components/department-select";
import { useClasses } from "@/features/academic/hooks/use-classes";
import { useSubjects } from "@/features/academic/hooks/use-subjects";
import {
  useAssignments,
  useCreateAssignment,
  useDeleteAssignment,
  useTeachers,
} from "@/features/academic/hooks/use-assignments";

export function AssignmentsManager({
  departments,
  lockedDepartmentId,
}: {
  departments: DepartmentPickOption[];
  lockedDepartmentId?: string;
}) {
  const [picked, setPicked] = useState(lockedDepartmentId ?? "");
  const departmentId = lockedDepartmentId ?? picked;

  return (
    <div className="flex flex-col gap-6">
      {!lockedDepartmentId && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="asg-dept">Department</Label>
          <div className="max-w-sm">
            <DepartmentSelect id="asg-dept" value={picked} onChange={setPicked} departments={departments} />
          </div>
        </div>
      )}

      {!departmentId ? (
        <Panel>Pick a department to manage its assignments.</Panel>
      ) : (
        <AssignmentsForDept departmentId={departmentId} />
      )}
    </div>
  );
}

function AssignmentsForDept({ departmentId }: { departmentId: string }) {
  const assignments = useAssignments(departmentId);
  const term = assignments.data?.term;

  return (
    <div className="flex flex-col gap-5">
      {assignments.isPending ? (
        <Panel>Loading…</Panel>
      ) : assignments.isError ? (
        <Panel>
          <span className="text-destructive">
            {assignments.error instanceof Error ? assignments.error.message : "Couldn’t load assignments."}
          </span>
        </Panel>
      ) : !term ? (
        <Panel>
          No active term. Activate one under <strong>Academic year &amp; terms</strong> first —
          assignments are scoped to the active semester.
        </Panel>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-accent/40 px-4 py-2.5 text-sm">
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-primary">
              Active term
            </span>
            <span className="text-foreground">{term.yearName} · {term.name}</span>
          </div>

          <NewAssignmentForm departmentId={departmentId} />

          <AssignmentList departmentId={departmentId} />
        </>
      )}
    </div>
  );
}

function NewAssignmentForm({ departmentId }: { departmentId: string }) {
  const create = useCreateAssignment(departmentId);
  const teachers = useTeachers(departmentId);
  const subjects = useSubjects(departmentId);
  const classes = useClasses(departmentId);

  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [sectionId, setSectionId] = useState("");

  // Flatten class -> sections into pickable "Class · Section" options.
  const sectionOptions = (classes.data ?? []).flatMap((c) =>
    c.sections.map((s) => ({ id: s.id, label: `${c.name} · ${s.name}` })),
  );
  const activeSubjects = (subjects.data ?? []).filter((s) => s.isActive);

  const canSubmit = teacherId && subjectId && sectionId && !create.isPending;

  return (
    <form
      className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        create.mutate(
          { teacherId, subjectId, sectionId },
          { onSuccess: () => { setSubjectId(""); setSectionId(""); } },
        );
      }}
    >
      <PickField label="Teacher" htmlFor="asg-teacher">
        <Picker
          id="asg-teacher"
          value={teacherId}
          onChange={setTeacherId}
          placeholder={teachers.data?.length ? "Select teacher" : "No teachers in dept"}
          options={(teachers.data ?? []).map((t) => ({ id: t.id, label: t.name }))}
        />
      </PickField>
      <PickField label="Subject" htmlFor="asg-subject">
        <Picker
          id="asg-subject"
          value={subjectId}
          onChange={setSubjectId}
          placeholder={activeSubjects.length ? "Select subject" : "No subjects yet"}
          options={activeSubjects.map((s) => ({ id: s.id, label: `${s.code} · ${s.name} (Sem ${s.semesterNumber})` }))}
        />
      </PickField>
      <PickField label="Section" htmlFor="asg-section">
        <Picker
          id="asg-section"
          value={sectionId}
          onChange={setSectionId}
          placeholder={sectionOptions.length ? "Select section" : "No sections yet"}
          options={sectionOptions}
        />
      </PickField>

      {create.isError && (
        <p role="alert" className="sm:col-span-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {create.error instanceof Error ? create.error.message : "Couldn’t add the assignment."}
        </p>
      )}
      <div className="sm:col-span-3">
        <Button type="submit" disabled={!canSubmit}>
          <Plus className="size-4" />
          Assign
        </Button>
      </div>
    </form>
  );
}

function AssignmentList({ departmentId }: { departmentId: string }) {
  const assignments = useAssignments(departmentId);
  const del = useDeleteAssignment(departmentId);
  const rows = assignments.data?.assignments ?? [];

  if (rows.length === 0) {
    return <Panel>No assignments for this term yet. Add one above.</Panel>;
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {rows.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{a.teacherName}</span>
            <span className="text-xs text-muted-foreground">
              <span className="font-mono">{a.subjectCode}</span> {a.subjectName} · {a.className} · {a.sectionName}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove assignment"
            disabled={del.isPending}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => del.mutate(a.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function Picker({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
  placeholder: string;
}) {
  const label = (v: unknown) => options.find((o) => o.id === v)?.label ?? placeholder;
  return (
    <Select value={value} onValueChange={(v) => onChange((v as string) ?? "")} disabled={options.length === 0}>
      <SelectTrigger id={id} className="h-10! w-full">
        <SelectValue placeholder={placeholder}>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PickField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-6 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
