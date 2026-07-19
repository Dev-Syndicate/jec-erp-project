// Classes & Sections management — under a department, create classes (e.g.
// "II B.Tech") and sections ("A", "B"). Super Admin picks a department; an HOD
// is pinned to their own. Attendance/assignments target a Section.
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DepartmentSelect, type DepartmentPickOption } from "@/components/department-select";
import { useClasses, useCreateClass, useCreateSection } from "@/features/academic/hooks/use-classes";
import type { ClassRow } from "@/features/academic/types";

export function ClassesManager({
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
          <Label htmlFor="cls-dept">Department</Label>
          <div className="max-w-sm">
            <DepartmentSelect id="cls-dept" value={picked} onChange={setPicked} departments={departments} />
          </div>
        </div>
      )}

      {!departmentId ? (
        <Panel>Pick a department to manage its classes.</Panel>
      ) : (
        <ClassList departmentId={departmentId} />
      )}
    </div>
  );
}

function ClassList({ departmentId }: { departmentId: string }) {
  const classes = useClasses(departmentId);

  return (
    <div className="flex flex-col gap-4">
      <NewClassForm departmentId={departmentId} />

      {classes.isPending ? (
        <Panel>Loading classes…</Panel>
      ) : classes.isError ? (
        <Panel>
          <span className="text-destructive">
            {classes.error instanceof Error ? classes.error.message : "Couldn’t load classes."}
          </span>
        </Panel>
      ) : classes.data.length === 0 ? (
        <Panel>No classes yet. Add the first one above.</Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {classes.data.map((c) => (
            <ClassCard key={c.id} cls={c} departmentId={departmentId} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewClassForm({ departmentId }: { departmentId: string }) {
  const create = useCreateClass(departmentId);
  const [name, setName] = useState("");
  const canSubmit = name.trim() && !create.isPending;

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        create.mutate(name.trim(), { onSuccess: () => setName("") });
      }}
    >
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="new-class">New class</Label>
        <Input id="new-class" value={name} onChange={(e) => setName(e.target.value)} placeholder="II B.Tech" className="h-10" />
      </div>
      <Button type="submit" disabled={!canSubmit}>
        <Plus className="size-4" />
        Add class
      </Button>
      {create.isError && (
        <p role="alert" className="w-full text-sm text-destructive">
          {create.error instanceof Error ? create.error.message : "Couldn’t add the class."}
        </p>
      )}
    </form>
  );
}

function ClassCard({ cls, departmentId }: { cls: ClassRow; departmentId: string }) {
  const createSection = useCreateSection(departmentId);
  const [name, setName] = useState("");
  const canSubmit = name.trim() && !createSection.isPending;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <span className="font-heading text-base font-semibold text-foreground">{cls.name}</span>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          Sections
        </span>
        {cls.sections.length === 0 ? (
          <span className="text-sm text-muted-foreground">none yet</span>
        ) : (
          cls.sections.map((s) => (
            <span key={s.id} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-sm text-foreground">
              {s.name}
            </span>
          ))
        )}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          createSection.mutate({ classId: cls.id, name: name.trim() }, { onSuccess: () => setName("") });
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add section (e.g. A)"
          className="h-9 max-w-40"
          aria-label={`Add a section to ${cls.name}`}
        />
        <Button type="submit" variant="outline" size="sm" disabled={!canSubmit}>
          <Plus className="size-4" />
          Add
        </Button>
        {createSection.isError && (
          <span role="alert" className="text-xs text-destructive">
            {createSection.error instanceof Error ? createSection.error.message : "Failed."}
          </span>
        )}
      </form>
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
