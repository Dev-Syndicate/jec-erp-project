// Student management — provision accounts, list students (program-scoped), edit
// details, change lifecycle status (which enables/disables login), reissue a temp
// password, and enroll into a class for the active year. Super-Admin only (page
// gates with AuthGate; the API re-checks). The temp password is shown exactly
// once on create/regenerate — the admin must deliver it before closing.
"use client";

import { useState } from "react";
import { Plus, Upload, Pencil, KeyRound, GraduationCap, Copy, Check } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/app/(app)/page-header";
import type { Gender, Student, StudentStatus } from "@/features/students/types";
import { FormSelect } from "@/features/students/components/form-select";
import { ImportStudentsDialog } from "@/features/students/components/import-students-dialog";
import {
  useClassOptions,
  useCreateStudent,
  useEnrollStudent,
  useProgramOptions,
  useRegeneratePassword,
  useStudents,
  useUpdateStudent,
} from "@/features/students/hooks/use-students";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}
const isoToDateInput = (iso: string) => (iso ? iso.slice(0, 10) : "");

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];
const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "GRADUATED", label: "Graduated" },
  { value: "DROPPED", label: "Dropped" },
  { value: "TRANSFERRED", label: "Transferred" },
];

function StatusPill({ student }: { student: Student }) {
  // Login disabled (non-ACTIVE lifecycle) reads as muted; active students that
  // are still on their temp password get a distinct "invited" hint.
  if (student.status !== "ACTIVE" || student.userStatus !== "ACTIVE") {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        {student.status === "ACTIVE" ? "Inactive" : student.status.toLowerCase()}
      </span>
    );
  }
  if (student.mustChangePassword) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-amber-600">
        Invited
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-emerald-600">
      Active
    </span>
  );
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

// The one-time temp-password reveal, shared by create + regenerate.
function TempPasswordPanel({ name, password }: { name: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Temporary password for <span className="font-medium text-foreground">{name}</span>. It’s
        shown once — deliver it now; they’ll set their own on first login.
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
        <code className="flex-1 px-1 font-mono text-sm text-foreground">{password}</code>
        <Button
          variant="outline"
          size="sm"
          data-icon="inline-start"
          onClick={() => {
            navigator.clipboard?.writeText(password).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => {},
            );
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function StudentManager() {
  const { data: students, isPending, isError, error } = useStudents();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [enrolling, setEnrolling] = useState<Student | null>(null);
  const [resetting, setResetting] = useState<Student | null>(null);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="People · Students"
          title="Students"
          description="Provision student accounts and enroll them into a class for the active academic year. Students sign in with their register number."
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImporting(true)} data-icon="inline-start">
            <Upload />
            Import
          </Button>
          <Button onClick={() => setCreating(true)} data-icon="inline-start">
            <Plus />
            Add student
          </Button>
        </div>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading students…</p>
      ) : isError ? (
        <FormError>{errorMessage(error)}</FormError>
      ) : students.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No students yet.</p>
          <Button variant="outline" onClick={() => setCreating(true)} data-icon="inline-start">
            <Plus />
            Add the first student
          </Button>
        </div>
      ) : (
        <div className="rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Register no.</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Class (this year)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.registerNumber}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{s.displayName}</span>
                      <span className="text-xs text-muted-foreground">{s.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.programLabel ?? "—"}</TableCell>
                  <TableCell>
                    {s.currentEnrollment ? (
                      <span className="font-mono text-xs">
                        {s.currentEnrollment.year}-{s.currentEnrollment.section}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not enrolled</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusPill student={s} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEnrolling(s)}
                        aria-label="Enroll student"
                        title="Enroll in a class"
                      >
                        <GraduationCap />
                      </Button>
                      {s.mustChangePassword && s.userStatus === "ACTIVE" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setResetting(s)}
                          aria-label="Reissue temp password"
                          title="Reissue temp password"
                        >
                          <KeyRound />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(s)}
                        aria-label="Edit student"
                      >
                        <Pencil />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {creating && <CreateStudentDialog onClose={() => setCreating(false)} />}
      {importing && <ImportStudentsDialog onClose={() => setImporting(false)} />}
      {editing && <EditStudentDialog student={editing} onClose={() => setEditing(null)} />}
      {enrolling && <EnrollDialog student={enrolling} onClose={() => setEnrolling(null)} />}
      {resetting && <RegenerateDialog student={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function CreateStudentDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateStudent();
  const programs = useProgramOptions();
  const activePrograms = (programs.data ?? []).filter((p) => p.isActive);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [programId, setProgramId] = useState("");
  const [registerNumber, setRegisterNumber] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");

  // On success we swap the form for the one-time password reveal.
  const created = create.data;

  const valid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    displayName.trim() !== "" &&
    programId !== "" &&
    registerNumber.trim() !== "" &&
    phone.trim() !== "" &&
    dateOfBirth !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    create.mutate({
      email: email.trim(),
      displayName: displayName.trim(),
      programId,
      registerNumber: registerNumber.trim(),
      rollNumber: rollNumber.trim() || null,
      dateOfBirth,
      phone: phone.trim(),
      gender: (gender || null) as Gender | null,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{created ? "Student created" : "Add student"}</DialogTitle>
          <DialogDescription>
            {created
              ? "The account is ready. Save the temporary password below."
              : "Provision a student account. A temporary password is generated and shown once."}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <>
            <TempPasswordPanel name={created.student.displayName} password={created.tempPassword} />
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <form id="student-form" onSubmit={submit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-name">Full name</Label>
                <Input id="s-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-10!" autoFocus required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-email">Email</Label>
                <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="h-10!" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-program">Program</Label>
                <FormSelect
                  id="s-program"
                  value={programId}
                  onChange={setProgramId}
                  options={activePrograms.map((p) => ({ value: p.id, label: p.label }))}
                  placeholder={programs.isPending ? "Loading…" : "Select a program"}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="s-reg">Register number</Label>
                  <Input id="s-reg" value={registerNumber} onChange={(e) => setRegisterNumber(e.target.value)} className="h-10!" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="s-roll">Roll number (optional)</Label>
                  <Input id="s-roll" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} className="h-10!" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="s-dob">Date of birth</Label>
                  <Input id="s-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="h-10!" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="s-phone">Phone</Label>
                  <Input id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10!" required />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-gender">Gender (optional)</Label>
                <FormSelect id="s-gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select" />
              </div>
              {create.isError && <FormError>{errorMessage(create.error)}</FormError>}
            </form>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={create.isPending}>
                Cancel
              </Button>
              <Button type="submit" form="student-form" disabled={!valid || create.isPending}>
                {create.isPending ? "Creating…" : "Create student"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditStudentDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const update = useUpdateStudent();
  const [displayName, setDisplayName] = useState(student.displayName);
  const [rollNumber, setRollNumber] = useState(student.rollNumber ?? "");
  const [phone, setPhone] = useState(student.phone);
  const [dateOfBirth, setDateOfBirth] = useState(isoToDateInput(student.dateOfBirth));
  const [gender, setGender] = useState(student.gender ?? "");
  const [status, setStatus] = useState<StudentStatus>(student.status);

  const valid = displayName.trim() !== "" && phone.trim() !== "" && dateOfBirth !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    update.mutate(
      {
        id: student.id,
        patch: {
          displayName: displayName.trim(),
          rollNumber: rollNumber.trim() || null,
          phone: phone.trim(),
          dateOfBirth,
          gender: (gender || null) as Gender | null,
          status,
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {student.displayName}</DialogTitle>
          <DialogDescription>
            Update details or lifecycle status. A non-active status disables sign-in until set back
            to Active. Register number and email aren’t editable here.
          </DialogDescription>
        </DialogHeader>
        <form id="edit-student-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="e-name">Full name</Label>
            <Input id="e-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-10!" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="e-roll">Roll number</Label>
              <Input id="e-roll" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} className="h-10!" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="e-phone">Phone</Label>
              <Input id="e-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10!" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="e-dob">Date of birth</Label>
              <Input id="e-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="h-10!" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="e-gender">Gender</Label>
              <FormSelect id="e-gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="e-status">Status</Label>
            <FormSelect
              id="e-status"
              value={status}
              onChange={(v) => setStatus(v as StudentStatus)}
              options={STATUS_OPTIONS}
              placeholder="Select"
            />
          </div>
          {update.isError && <FormError>{errorMessage(update.error)}</FormError>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="edit-student-form" disabled={!valid || update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnrollDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const enroll = useEnrollStudent();
  const classes = useClassOptions();
  // Only classes in the student's own program are valid targets.
  const options = (classes.data ?? []).filter(
    (c) => c.isActive && c.programId === student.programId,
  );
  const [classId, setClassId] = useState(student.currentEnrollment?.classId ?? "");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enroll {student.displayName}</DialogTitle>
          <DialogDescription>
            Place the student in a class for the active academic year. Re-enrolling moves them to a
            different class for this year.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="enroll-class">Class</Label>
          <FormSelect
            id="enroll-class"
            value={classId}
            onChange={setClassId}
            options={options.map((c) => ({ value: c.id, label: c.label }))}
            placeholder={
              classes.isPending
                ? "Loading…"
                : options.length === 0
                  ? "No classes in this program yet"
                  : "Select a class"
            }
          />
        </div>
        {enroll.isError && <FormError>{errorMessage(enroll.error)}</FormError>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enroll.isPending}>
            Cancel
          </Button>
          <Button
            disabled={classId === "" || enroll.isPending}
            onClick={() => enroll.mutate({ id: student.id, classId }, { onSuccess: onClose })}
          >
            {enroll.isPending ? "Enrolling…" : "Enroll"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegenerateDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const regen = useRegeneratePassword();
  const created = regen.data;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reissue temporary password</DialogTitle>
          <DialogDescription>
            {created
              ? "Deliver the new temporary password below — it replaces the previous one."
              : `Generate a fresh temporary password for ${student.displayName}. Only works while they haven't set their own yet.`}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <TempPasswordPanel name={student.displayName} password={created.tempPassword} />
        ) : (
          regen.isError && <FormError>{errorMessage(regen.error)}</FormError>
        )}
        <DialogFooter>
          {created ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={regen.isPending}>
                Cancel
              </Button>
              <Button disabled={regen.isPending} onClick={() => regen.mutate(student.id)}>
                {regen.isPending ? "Generating…" : "Reissue password"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
