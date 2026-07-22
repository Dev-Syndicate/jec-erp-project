// My class — the class teacher's view + edit of their class's students. Pick an
// advised class, browse the roster, open a student to see full details and correct
// their detail fields (name, roll no., phone, DOB, gender). Identity (register
// number / email), status and class placement are read-only here — those stay with
// HOD/Admin. The API re-checks advisor ownership.
"use client";

import { useMemo, useState } from "react";
import { Pencil, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/app/(app)/page-header";
import { FormSelect } from "@/features/roster/components/form-select";
import type { Gender, StudentDetail } from "@/features/roster/types";
import {
  useAdvisedClasses,
  useClassRoster,
  useUpdateStudent,
} from "@/features/roster/hooks/use-roster";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}
const isoToDateInput = (iso: string) => (iso ? iso.slice(0, 10) : "");

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function ClassRoster() {
  const classes = useAdvisedClasses();
  const [classId, setClassId] = useState("");

  const activeClasses = (classes.data ?? []).filter((c) => c.isActive);
  const singleClass = activeClasses.length === 1;
  const effClassId = singleClass ? activeClasses[0].id : classId;

  const view = useClassRoster(effClassId || null, !!effClassId);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        eyebrow="People · My class"
        title="My class students"
        description="View and edit the details of the students in the class you advise."
      />

      {!singleClass && (
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Class">
            <div className="w-56">
              <FormSelect
                value={classId}
                onChange={setClassId}
                options={activeClasses.map((c) => ({ value: c.id, label: c.label }))}
                placeholder={
                  classes.isPending
                    ? "Loading…"
                    : activeClasses.length === 0
                      ? "No classes"
                      : "Select a class"
                }
              />
            </div>
          </Field>
        </div>
      )}

      {classes.isPending ? (
        <p className="text-sm text-muted-foreground">Loading your classes…</p>
      ) : activeClasses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You&apos;re not the class teacher for any class.
        </p>
      ) : effClassId === "" ? (
        <p className="text-sm text-muted-foreground">Pick a class to see its students.</p>
      ) : view.isPending ? (
        <p className="text-sm text-muted-foreground">Loading students…</p>
      ) : view.isError ? (
        <FormError>{errorMessage(view.error)}</FormError>
      ) : view.data ? (
        <Loaded classId={view.data.classId} classLabel={view.data.classLabel} academicYear={view.data.academicYear} students={view.data.students} />
      ) : null}
    </div>
  );
}

function Loaded({
  classId,
  classLabel,
  academicYear,
  students,
}: {
  classId: string;
  classLabel: string;
  academicYear: string;
  students: StudentDetail[];
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<StudentDetail | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.registerNumber.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q) ||
        (s.rollNumber ?? "").toLowerCase().includes(q),
    );
  }, [students, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{classLabel}</span>
          {" · "}
          {academicYear}
          {" · "}
          {students.length} students
        </p>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or register no.…"
            aria-label="Search students"
            className="h-10! pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No students match the search.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full min-w-160 border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground/10 bg-muted/30 text-left text-muted-foreground">
                <th className="w-10 px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Register no.</th>
                <th className="px-3 py-2 font-medium">Roll no.</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="w-0 px-3 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id} className="border-b border-foreground/10 last:border-b-0">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.registerNumber}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{s.rollNumber ?? "—"}</td>
                  <td className="px-3 py-2">{s.displayName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.phone}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        data-icon="inline-start"
                        onClick={() => setEditing(s)}
                        aria-label={`View or edit ${s.displayName}`}
                      >
                        <Pencil />
                        View / edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <StudentDialog classId={classId} student={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="rounded-md bg-muted/40 px-3 py-2 text-sm">{value}</span>
    </div>
  );
}

function StudentDialog({
  classId,
  student,
  onClose,
}: {
  classId: string;
  student: StudentDetail;
  onClose: () => void;
}) {
  const update = useUpdateStudent(classId);

  const [displayName, setDisplayName] = useState(student.displayName);
  const [rollNumber, setRollNumber] = useState(student.rollNumber ?? "");
  const [phone, setPhone] = useState(student.phone);
  const [gender, setGender] = useState<string>(student.gender ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(isoToDateInput(student.dateOfBirth));

  const valid = displayName.trim() !== "" && phone.trim() !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    update.mutate(
      {
        studentId: student.id,
        patch: {
          displayName: displayName.trim(),
          rollNumber: rollNumber.trim() || null,
          phone: phone.trim(),
          gender: (gender || null) as Gender | null,
          dateOfBirth: dateOfBirth || undefined,
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{student.displayName}</DialogTitle>
          <DialogDescription>
            Full details. You can edit name, roll number, phone, date of birth and gender. Register
            number, email, status and class aren&apos;t editable here.
          </DialogDescription>
        </DialogHeader>

        <form id="student-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
          <ReadOnly label="Register number" value={student.registerNumber} />
          <ReadOnly label="Email" value={student.email} />
          <ReadOnly label="Class" value={student.currentEnrollment?.classLabel ?? "—"} />
          <ReadOnly label="Status" value={student.status} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="s-name">Full name</Label>
            <Input id="s-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-10!" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="s-roll">Roll number</Label>
            <Input id="s-roll" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} className="h-10!" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="s-phone">Phone</Label>
            <Input id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10!" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="s-dob">Date of birth</Label>
            <Input id="s-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="h-10!" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="s-gender">Gender</Label>
            <FormSelect id="s-gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select" />
          </div>

          {update.isError && (
            <div className="col-span-2">
              <FormError>{errorMessage(update.error)}</FormError>
            </div>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="student-form" disabled={!valid || update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
