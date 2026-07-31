// Student management — provision accounts, list students (program-scoped), edit
// details, change lifecycle status (which enables/disables login), reissue a temp
// password, and enroll into a class for the active year. Super-Admin only (page
// gates with AuthGate; the API re-checks). The temp password is shown exactly
// once on create/regenerate — the admin must deliver it before closing.
"use client";

import { useEffect, useState } from "react";
import { Plus, Upload, Pencil, KeyRound, Copy, Check, Search } from "lucide-react";

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
import type { Gender, Student, StudentFilters, StudentStatus } from "@/features/students/types";
import { FormSelect } from "@/features/students/components/form-select";
import { ClassCascade } from "@/features/students/components/class-cascade";
import { ImportStudentsDialog } from "@/features/students/components/import-students-dialog";
import { StudentFilterBar } from "@/features/students/components/student-filter-bar";
import {
  useClassOptions,
  useCreateStudent,
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
const PAGE_SIZE = 50;

// Debounce a fast-changing value (the search box) so we don't hit the API on
// every keystroke.
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

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

/**
 * `isInstitutionScoped` decides which filter CONTROLS are offered — an
 * institution role (Super Admin) spans every program, so the Program filter is
 * meaningful to them; a program-scoped role has exactly one and would get a
 * one-entry dropdown. It is passed in by the page rather than read here, because
 * a feature must not import another feature's hooks (CLAUDE.md).
 *
 * This is presentation only. The API scopes every query to the caller's own
 * program independently, so it is never the thing keeping data safe.
 */
export function StudentManager({ isInstitutionScoped = false }: { isInstitutionScoped?: boolean }) {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [resetting, setResetting] = useState<Student | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<StudentFilters>({});

  // Server-side search + filters + pagination: one page (50 rows) + a total, so
  // the list scales to thousands of students instead of downloading them all.
  const debouncedQuery = useDebounced(query.trim(), 300);
  const { data, isPending, isError, error, isPlaceholderData } = useStudents(
    page,
    debouncedQuery,
    filters,
  );

  const programs = useProgramOptions();
  const classes = useClassOptions();

  const students = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const searching = debouncedQuery !== "";
  const filtering = Object.keys(filters).length > 0;

  // Pagination is SERVER-side, so asking for a page past the end returns an
  // empty list rather than clamping itself. Applying a filter resets to page 1,
  // but a mutation can also shrink the result set beneath a high page (editing
  // the last student on page 10 out of the filter, say), which would strand the
  // user on a blank page.
  //
  // The stored `page` is therefore a REQUEST and this is the effective value —
  // derived during render rather than corrected in an effect, which would cost
  // an extra render and can cascade.
  const currentPage = Math.min(page, pageCount);
  const startIdx = (currentPage - 1) * PAGE_SIZE;

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
      ) : total === 0 && !searching && !filtering ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No students yet.</p>
          <Button variant="outline" onClick={() => setCreating(true)} data-icon="inline-start">
            <Plus />
            Add the first student
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, register no. or email…"
              aria-label="Search students"
              className="h-10! pl-9"
            />
          </div>

          <StudentFilterBar
            filters={filters}
            onChange={(next) => {
              setFilters(next);
              setPage(1); // a narrower result set invalidates the current page
            }}
            programs={programs.data ?? []}
            classes={classes.data ?? []}
            showProgram={isInstitutionScoped}
          />

          {students.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {searching
                  ? `No students match “${debouncedQuery}”${filtering ? " with these filters" : ""}.`
                  : filtering
                    ? "No students match these filters."
                    : "No students on this page."}
              </p>
            </div>
          ) : (
            <div
              className={`rounded-xl ring-1 ring-foreground/10 ${isPlaceholderData ? "opacity-60" : ""}`}
            >
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

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Showing {startIdx + 1}–{startIdx + students.length} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  // Step back from the EFFECTIVE page, so a request that
                  // overshot the end still walks back one page at a time.
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1 || isPlaceholderData}
                >
                  Previous
                </Button>
                <span className="font-mono text-xs">
                  Page {currentPage} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                  disabled={currentPage >= pageCount || isPlaceholderData}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {creating && <CreateStudentDialog onClose={() => setCreating(false)} />}
      {importing && <ImportStudentsDialog onClose={() => setImporting(false)} />}
      {editing && <EditStudentDialog student={editing} onClose={() => setEditing(null)} />}
      {resetting && <RegenerateDialog student={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function CreateStudentDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateStudent();
  const programs = useProgramOptions();
  const classes = useClassOptions();
  const activePrograms = (programs.data ?? []).filter((p) => p.isActive);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");
  const [registerNumber, setRegisterNumber] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");

  // Classes for the chosen program feed the Year → Section cascade.
  const classesInProgram = (classes.data ?? []).filter((c) => c.isActive && c.programId === programId);

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
      classId: classId || undefined, // optional — enrol now, or place later
      registerNumber: registerNumber.trim(),
      rollNumber: rollNumber.trim() || null,
      dateOfBirth,
      phone: phone.trim(),
      gender: (gender || null) as Gender | null,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
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
            {/* Landscape: 3 columns on desktop, 1 on narrow screens — matches
                the Edit dialog so the two read as the same form. */}
            <form id="student-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-name">Full name</Label>
                <Input id="s-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-10!" autoFocus required />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="s-email">Email</Label>
                <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="h-10!" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-reg">Register number</Label>
                <Input id="s-reg" value={registerNumber} onChange={(e) => setRegisterNumber(e.target.value)} className="h-10!" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-roll">Roll number (optional)</Label>
                <Input id="s-roll" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} className="h-10!" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-dob">Date of birth</Label>
                <Input id="s-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="h-10!" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-phone">Phone</Label>
                <Input id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10!" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-gender">Gender (optional)</Label>
                <FormSelect id="s-gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="s-program">Program</Label>
                <FormSelect
                  id="s-program"
                  value={programId}
                  onChange={(v) => {
                    setProgramId(v);
                    setClassId(""); // classes differ per program — reset the choice
                  }}
                  options={activePrograms.map((p) => ({ value: p.id, label: p.label }))}
                  placeholder={programs.isPending ? "Loading…" : "Select a program"}
                />
              </div>
              {/* Class is optional — place them now (Year + Section) or later via
                  "Change class". Takes the full row as its own Year | Section pair. */}
              <div className="flex flex-col gap-2 sm:col-span-3">
                <Label>Class (optional)</Label>
                <ClassCascade
                  key={programId || "none"}
                  classes={classesInProgram}
                  onChange={setClassId}
                  loading={classes.isPending}
                  disabled={programId === ""}
                  idPrefix="s"
                />
              </div>
              {create.isError && (
                <div className="sm:col-span-3">
                  <FormError>{errorMessage(create.error)}</FormError>
                </div>
              )}
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
  const classes = useClassOptions();
  const [displayName, setDisplayName] = useState(student.displayName);
  // Identity fields — both are login handles (register number is what the student
  // types to sign in; email is the Firebase identity behind it), so they're sent
  // only when actually changed and the dialog warns before saving.
  const [registerNumber, setRegisterNumber] = useState(student.registerNumber);
  const [email, setEmail] = useState(student.email);
  const [rollNumber, setRollNumber] = useState(student.rollNumber ?? "");
  const [phone, setPhone] = useState(student.phone);
  const [dateOfBirth, setDateOfBirth] = useState(isoToDateInput(student.dateOfBirth));
  const [gender, setGender] = useState(student.gender ?? "");
  const [status, setStatus] = useState<StudentStatus>(student.status);
  // Class (enrollment) is edited inline here. Preselect the current class; only
  // send it on save when it actually changed.
  const currentClassId = student.currentEnrollment?.classId ?? "";
  const [classId, setClassId] = useState(currentClassId);
  const classesInProgram = (classes.data ?? []).filter(
    (c) => c.isActive && c.programId === student.programId,
  );

  const registerChanged = registerNumber.trim() !== student.registerNumber;
  const emailChanged = email.trim().toLowerCase() !== student.email.toLowerCase();
  const identityChanged = registerChanged || emailChanged;

  const valid =
    displayName.trim() !== "" &&
    phone.trim() !== "" &&
    dateOfBirth !== "" &&
    registerNumber.trim() !== "" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

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
          // Send identity fields only when changed — an unchanged email would
          // otherwise cost a pointless Firebase round-trip on every save.
          ...(registerChanged ? { registerNumber: registerNumber.trim() } : {}),
          ...(emailChanged ? { email: email.trim().toLowerCase() } : {}),
          ...(classId && classId !== currentClassId ? { classId } : {}),
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit {student.displayName}</DialogTitle>
          <DialogDescription>
            Update details, class or lifecycle status. A non-active status disables sign-in until set
            back to Active. Register number and email are the student’s sign-in details — changing
            either changes how they log in.
          </DialogDescription>
        </DialogHeader>
        {/* Landscape: 3 columns on desktop so the whole form fits without
            scrolling, collapsing to 1 column on narrow screens. Fields are
            grouped by row — identity, then details, then placement. */}
        <form id="edit-student-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2 sm:col-span-3">
            <Label htmlFor="e-name">Full name</Label>
            <Input id="e-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-10!" required />
          </div>
          {/* Sign-in details. Grouped together and flagged so an admin editing a
              phone number doesn't change a login handle without noticing. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="e-reg">Register number</Label>
            <Input id="e-reg" value={registerNumber} onChange={(e) => setRegisterNumber(e.target.value)} className="h-10!" required />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="e-email">Email</Label>
            <Input id="e-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10!" required />
          </div>
          {identityChanged && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 sm:col-span-3 dark:text-amber-200">
              {registerChanged && emailChanged
                ? "This changes both sign-in details. "
                : registerChanged
                  ? "This changes the register number they sign in with. "
                  : "This changes the email their account authenticates with. "}
              Tell {student.displayName} before saving — their password is unchanged.
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="e-roll">Roll number</Label>
            <Input id="e-roll" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} className="h-10!" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="e-phone">Phone</Label>
            <Input id="e-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10!" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="e-dob">Date of birth</Label>
            <Input id="e-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="h-10!" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="e-gender">Gender</Label>
            <FormSelect id="e-gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select" />
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
          {/* Class (enrollment) for the active year — edited alongside details.
              ClassCascade renders its own Year + Section pair, so it takes the
              full row rather than sitting in a single column. */}
          <div className="flex flex-col gap-2 sm:col-span-3">
            <Label>Class</Label>
            <ClassCascade
              classes={classesInProgram}
              initialClassId={currentClassId}
              onChange={setClassId}
              loading={classes.isPending}
              idPrefix="e"
            />
          </div>
          {update.isError && (
            <div className="sm:col-span-3">
              <FormError>{errorMessage(update.error)}</FormError>
            </div>
          )}
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
