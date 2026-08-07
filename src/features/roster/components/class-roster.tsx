// My class — the class teacher's view + edit of their class's students. Pick an
// advised class, browse the roster, open a student to see full details and correct
// their detail fields (name, roll no., phone, DOB, gender). Identity (register
// number / email), status and class placement are read-only here — those stay with
// HOD/Admin. The API re-checks advisor ownership.
"use client";

import { useMemo, useState } from "react";
import { KeyRound, Pencil, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EmptyState } from "@/components/ui/empty-state";
import { errorMessage } from "@/lib/errors";
import { CopyButton } from "@/components/copy-button";
import { SearchInput } from "@/components/search-input";
import { DetailPanel } from "@/components/detail-panel";
import { FormField, FormSection } from "@/components/form-field";
import { TABLE_FRAME } from "@/app/(app)/page-shell";
import { FormError } from "@/components/form-error";
import { PageShell } from "@/app/(app)/page-shell";
import { LoadingState } from "@/components/loading-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/app/(app)/page-header";
import { FormSelect } from "@/components/form-select";
import type { Gender, StudentDetail } from "@/features/roster/types";
import {
  useAdvisedClasses,
  useClassRoster,
  useRegeneratePassword,
  useUpdateStudent,
} from "@/features/roster/hooks/use-roster";

const isoToDateInput = (iso: string) => (iso ? iso.slice(0, 10) : "");

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// The one-time temp-password reveal, shown after a reset. Mirrors the admin's
// Students panel — the password is shown once; the teacher must deliver it now.
function TempPasswordPanel({ name, password }: { name: string; password: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm text-muted-foreground">
        New temporary password for <span className="font-medium text-foreground">{name}</span>. It’s
        shown once — deliver it now; they’ll set their own on first login.
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
        <code className="flex-1 px-1 font-mono text-sm text-foreground">{password}</code>
        <CopyButton value={password} />
      </div>
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
    <PageShell>
      <PageHeader
        eyebrow="People · My class"
        title="My class students"
        description="View and edit the details of the students in the class you advise."
      />

      {!singleClass && (
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Class">
            <div className="w-full sm:w-56">
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
        <LoadingState label="Loading your classes…" />
      ) : activeClasses.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="You're not the class teacher for any class"
          description="This screen belongs to a class advisor. If that should be you, ask your HOD to set you as the class teacher."
        />
      ) : effClassId === "" ? (
        <EmptyState size="sm" title="Pick a class to see its students." />
      ) : view.isPending ? (
        <TableSkeleton rows={10} cols={6} label="Loading students…" />
      ) : view.isError ? (
        <FormError>{errorMessage(view.error)}</FormError>
      ) : view.data ? (
        <Loaded classId={view.data.classId} classLabel={view.data.classLabel} academicYear={view.data.academicYear} students={view.data.students} />
      ) : null}
    </PageShell>
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
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search name or register no.…"
          label="Search students"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState size="sm" title="No students match the search." />
      ) : (
        <Table containerClassName={TABLE_FRAME} className="min-w-160">
            <TableHeader>
              <TableRow>
                {/* Position in the filtered list, not a stored number — a roster
                    is read down the page, so "the 14th row" is what someone
                    calling out names is actually looking for. */}
                <TableHead className="w-10">#</TableHead>
                <TableHead>Register no.</TableHead>
                <TableHead>Roll no.</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="w-0 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s, i) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-mono text-xs">{s.registerNumber}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.rollNumber ?? "—"}</TableCell>
                  <TableCell>{s.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      {/* A labelled button, not a ⋯ menu: this row has exactly
                          one action and it is the point of the screen. */}
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      )}

      {editing && (
        <StudentDialog classId={classId} student={editing} onClose={() => setEditing(null)} />
      )}
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
  const regen = useRegeneratePassword(classId);

  const [displayName, setDisplayName] = useState(student.displayName);
  const [rollNumber, setRollNumber] = useState(student.rollNumber ?? "");
  const [phone, setPhone] = useState(student.phone);
  const [gender, setGender] = useState<string>(student.gender ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(isoToDateInput(student.dateOfBirth));
  // The freshly-issued temp password, revealed once after a reset.
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // A reset is only offered while the student is still on their temp password —
  // once they've set their own, it's an account-recovery flow, not this. The API
  // enforces this too (409); the button just avoids offering a dead action.
  const canReset = student.mustChangePassword && student.userStatus === "ACTIVE";

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

        {/* The detail layout: identity panel beside the editable fields. This is
            the closest thing the app has to a student detail view, so it reads
            like one — what is FIXED about this student (their login handles,
            their class) sits in the panel; what a class teacher may correct sits
            in the form.

            The split is not cosmetic: /api/roster deliberately refuses register
            number and email (they are sign-in handles, and only the students
            screen may change them), so showing them as panel facts rather than
            greyed-out inputs states that rule instead of implying a permission
            problem. */}
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <DetailPanel
            // Not sticky here: inside a dialog the panel is already in view.
            className="order-1 lg:top-0"
            name={student.displayName}
            subtitle={student.currentEnrollment?.classLabel ?? "Not enrolled"}
            meta={[
              { label: "Register no.", value: student.registerNumber },
              { label: "Email", value: student.email },
              { label: "Status", value: student.status },
            ]}
          />

          <form id="student-form" onSubmit={submit} className="order-2 flex flex-col gap-4">
            <FormSection title="Editable details" columns={2}>
              <FormField id="s-name" label="Full name" required>
                <Input size="lg" id="s-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              </FormField>
              <FormField id="s-roll" label="Roll number">
                <Input size="lg" id="s-roll" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
              </FormField>
              <FormField id="s-phone" label="Phone" required>
                <Input size="lg" id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </FormField>
              <FormField id="s-dob" label="Date of birth">
                <Input size="lg" id="s-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              </FormField>
              <FormField id="s-gender" label="Gender">
                <FormSelect id="s-gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select" />
              </FormField>
            </FormSection>

            {update.isError && <FormError>{errorMessage(update.error)}</FormError>}
            {regen.isError && <FormError>{errorMessage(regen.error)}</FormError>}
            {tempPassword && <TempPasswordPanel name={student.displayName} password={tempPassword} />}
          </form>
        </div>

        <DialogFooter className="sm:justify-between">
          {canReset ? (
            <Button
              type="button"
              variant="outline"
              data-icon="inline-start"
              onClick={() =>
                regen.mutate(student.id, { onSuccess: (r) => setTempPassword(r.tempPassword) })
              }
              disabled={regen.isPending || update.isPending}
            >
              <KeyRound />
              {regen.isPending ? "Resetting…" : tempPassword ? "Reset again" : "Reset password"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={update.isPending}>
              {tempPassword ? "Done" : "Cancel"}
            </Button>
            <Button type="submit" form="student-form" disabled={!valid || update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
