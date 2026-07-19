// Subject catalog management — the reusable curriculum catalog per department,
// grouped by semester (1-8). Add subjects; deactivate on a syllabus change
// (never deleted, so historical assignments stay intact) and reactivate if
// needed. Super Admin picks a department; an HOD is pinned to their own.
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DepartmentSelect, type DepartmentPickOption } from "@/components/department-select";
import {
  useCreateSubject,
  useSetSubjectActive,
  useSubjects,
} from "@/features/academic/hooks/use-subjects";
import type { Subject } from "@/features/academic/types";

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

export function SubjectsManager({
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
          <Label htmlFor="subj-dept">Department</Label>
          <div className="max-w-sm">
            <DepartmentSelect id="subj-dept" value={picked} onChange={setPicked} departments={departments} />
          </div>
        </div>
      )}

      {!departmentId ? (
        <Panel>Pick a department to manage its subjects.</Panel>
      ) : (
        <SubjectList departmentId={departmentId} />
      )}
    </div>
  );
}

function SubjectList({ departmentId }: { departmentId: string }) {
  const subjects = useSubjects(departmentId);

  return (
    <div className="flex flex-col gap-5">
      <NewSubjectForm departmentId={departmentId} />

      {subjects.isPending ? (
        <Panel>Loading subjects…</Panel>
      ) : subjects.isError ? (
        <Panel>
          <span className="text-destructive">
            {subjects.error instanceof Error ? subjects.error.message : "Couldn’t load subjects."}
          </span>
        </Panel>
      ) : subjects.data.length === 0 ? (
        <Panel>No subjects yet. Add the first one above.</Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {SEMESTERS.map((sem) => {
            const rows = subjects.data.filter((s) => s.semesterNumber === sem);
            if (rows.length === 0) return null;
            return (
              <div key={sem} className="flex flex-col gap-2">
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
                  Semester {sem}
                </span>
                <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {rows.map((s) => (
                    <SubjectRow key={s.id} subject={s} departmentId={departmentId} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubjectRow({ subject, departmentId }: { subject: Subject; departmentId: string }) {
  const setActive = useSetSubjectActive(departmentId);
  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2 ${subject.isActive ? "" : "opacity-55"}`}>
      <span className="flex items-center gap-2 text-sm text-foreground">
        <span className="font-mono text-xs text-muted-foreground">{subject.code}</span>
        {subject.name}
        {!subject.isActive && (
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground">
            Inactive
          </span>
        )}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={setActive.isPending}
        className={subject.isActive ? "text-muted-foreground hover:text-destructive" : ""}
        onClick={() => setActive.mutate({ id: subject.id, isActive: !subject.isActive })}
      >
        {subject.isActive ? "Deactivate" : "Reactivate"}
      </Button>
    </div>
  );
}

function NewSubjectForm({ departmentId }: { departmentId: string }) {
  const create = useCreateSubject(departmentId);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [semester, setSemester] = useState("");

  const canSubmit = name.trim() && code.trim() && semester && !create.isPending;

  return (
    <form
      className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        create.mutate(
          { name: name.trim(), code: code.trim(), semesterNumber: Number(semester) },
          { onSuccess: () => { setName(""); setCode(""); setSemester(""); } },
        );
      }}
    >
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="subj-name">Subject name</Label>
        <Input id="subj-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Data Structures" className="h-10" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="subj-code">Code</Label>
        <Input id="subj-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS201" className="h-10 uppercase" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="subj-sem">Semester</Label>
        <Select value={semester} onValueChange={(v) => setSemester((v as string) ?? "")}>
          <SelectTrigger id="subj-sem" className="h-10! w-full">
            <SelectValue placeholder="Sem">{(v: unknown) => (v ? `Semester ${v}` : "Sem")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SEMESTERS.map((s) => (
              <SelectItem key={s} value={String(s)}>Semester {s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {create.isError && (
        <p role="alert" className="sm:col-span-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {create.error instanceof Error ? create.error.message : "Couldn’t add the subject."}
        </p>
      )}
      <div className="sm:col-span-4">
        <Button type="submit" disabled={!canSubmit}>
          <Plus className="size-4" />
          Add subject
        </Button>
      </div>
    </form>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-6 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
