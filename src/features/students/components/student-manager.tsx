// Student management — provision accounts, list students (program-scoped), edit
// details, change lifecycle status (which enables/disables login), reissue a temp
// password, and enroll into a class for the active year. Super-Admin only (page
// gates with AuthGate; the API re-checks). The temp password is shown exactly
// once on create/regenerate — the admin must deliver it before closing.
"use client";

import { useEffect, useState } from "react";
import { Plus, Upload, Pencil, KeyRound, Users } from "lucide-react";

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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorMessage } from "@/lib/errors";
import { CopyButton } from "@/components/copy-button";
import { FormError } from "@/components/form-error";
import { FormField, FormSection, FormSectionDivider } from "@/components/form-field";
import { LoadingState } from "@/components/loading-state";
import { RowActions } from "@/components/row-actions";
import { SearchInput } from "@/components/search-input";
import { AccountBadge } from "@/components/status-badge";
import { TablePagination } from "@/components/table-pagination";
import { PageHeader } from "@/app/(app)/page-header";
import { PageShell, PageShellHeader, TABLE_FRAME } from "@/app/(app)/page-shell";
import type { Gender, Student, StudentFilters, StudentStatus } from "@/features/students/types";
import { FormSelect } from "@/components/form-select";
import { ClassCascade } from "@/features/students/components/class-cascade";
import { ImportStudentsDialog } from "@/features/students/components/import-students-dialog";
import { CredentialsDialog } from "@/features/students/components/credentials-dialog";
import { StudentFilterBar } from "@/features/students/components/student-filter-bar";
import {
  useClassOptions,
  useCreateStudent,
  useProgramOptions,
  useRegeneratePassword,
  useStudents,
  useUpdateStudent,
} from "@/features/students/hooks/use-students";

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
  return (
    <AccountBadge
      recordActive={student.status === "ACTIVE"}
      loginActive={student.userStatus === "ACTIVE"}
      mustChangePassword={student.mustChangePassword}
      // When the STUDENT record is the reason (graduated, dropped, transferred),
      // name it — "Inactive" would hide which of those happened. When only the
      // login is off, the generic word is the honest one.
      inactiveLabel={student.status === "ACTIVE" ? undefined : student.status.toLowerCase()}
    />
  );
}

// The one-time temp-password reveal, shared by create + regenerate.
function TempPasswordPanel({ name, password }: { name: string; password: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Temporary password for <span className="font-medium text-foreground">{name}</span>. It’s
        shown once — deliver it now; they’ll set their own on first login.
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
        <code className="flex-1 px-1 font-mono text-sm text-foreground">{password}</code>
        <CopyButton value={password} />
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
  const [credentials, setCredentials] = useState(false);
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
    <PageShell>
      <PageShellHeader
        actions={
          <>
            <Button variant="outline" onClick={() => setCredentials(true)} data-icon="inline-start">
              <KeyRound />
              Credentials
            </Button>
            <Button variant="outline" onClick={() => setImporting(true)} data-icon="inline-start">
              <Upload />
              Import
            </Button>
            <Button onClick={() => setCreating(true)} data-icon="inline-start">
              <Plus />
              Add student
            </Button>
          </>
        }
      >
        <PageHeader
          eyebrow="People · Students"
          title="Students"
          description="Provision student accounts and enroll them into a class for the active academic year. Students sign in with their register number."
        />
      </PageShellHeader>

      {isPending ? (
        <LoadingState label="Loading students…" />
      ) : isError ? (
        <FormError>{errorMessage(error)}</FormError>
      ) : total === 0 && !searching && !filtering ? (
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Provision accounts one at a time, or import a spreadsheet to onboard a whole class."
          action={
            <Button variant="outline" onClick={() => setCreating(true)} data-icon="inline-start">
              <Plus />
              Add the first student
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Search by name, register no. or email…"
            label="Search students"
          />

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
            <EmptyState
              size="sm"
              title={
                searching
                  ? `No students match “${debouncedQuery}”${filtering ? " with these filters" : ""}.`
                  : filtering
                    ? "No students match these filters."
                    : "No students on this page."
              }
            />
          ) : (
            <Table
              // `opacity-60` while TanStack serves placeholder data: the previous
              // page stays on screen during the fetch, and dimming it is what
              // tells the user the rows are stale rather than simply slow.
              containerClassName={`${TABLE_FRAME} ${isPlaceholderData ? "opacity-60" : ""}`}
            >
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
                      <RowActions
                        label={`Actions for ${s.registerNumber}`}
                        actions={[
                          { label: "Edit student", icon: Pencil, onSelect: () => setEditing(s) },
                          // Only meaningful while they are still on the temp
                          // password — regenerating after they have set their own
                          // would lock them out of an account they were using.
                          s.mustChangePassword &&
                            s.userStatus === "ACTIVE" && {
                              label: "Reissue temp password",
                              icon: KeyRound,
                              onSelect: () => setResetting(s),
                            },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {total > PAGE_SIZE && (
            <TablePagination
              // All numbers, no state. `currentPage` is the EFFECTIVE page —
              // derived at render as Math.min(page, pageCount), because a
              // server-paginated request past the end returns nothing rather
              // than clamping. Handing the component the raw `page` would
              // reintroduce exactly the blank-page bug that derivation fixes.
              page={currentPage}
              pageCount={pageCount}
              total={total}
              rangeStart={startIdx + 1}
              rangeEnd={startIdx + students.length}
              onPageChange={(p) => setPage(Math.min(pageCount, Math.max(1, p)))}
              disabled={isPlaceholderData}
              noun="students"
            />
          )}
        </div>
      )}

      {creating && <CreateStudentDialog onClose={() => setCreating(false)} />}
      {importing && <ImportStudentsDialog onClose={() => setImporting(false)} />}
      {credentials && <CredentialsDialog onClose={() => setCredentials(false)} />}
      {editing && <EditStudentDialog student={editing} onClose={() => setEditing(null)} />}
      {resetting && <RegenerateDialog student={resetting} onClose={() => setResetting(null)} />}
    </PageShell>
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
            {/* Three sections rather than one 9-field grid: sign-in details are
                what the student uses to get in, personal details are about them,
                placement is where they sit. Grouping them turns a wall of inputs
                into three short questions and makes the "what is a login handle
                here" distinction visible. */}
            <form id="student-form" onSubmit={submit} className="flex flex-col gap-5">
              <FormSection
                title="Sign-in details"
                description="The student signs in with their register number; the email is the identity behind it."
                columns={2}
              >
                <FormField id="s-name" label="Full name" required>
                  <Input size="lg" id="s-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus required />
                </FormField>
                <FormField id="s-email" label="Email" required>
                  <Input size="lg" id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required />
                </FormField>
                <FormField id="s-reg" label="Register number" required hint="Unique — this is the login handle.">
                  <Input size="lg" id="s-reg" value={registerNumber} onChange={(e) => setRegisterNumber(e.target.value)} required />
                </FormField>
                <FormField id="s-roll" label="Roll number" hint="Optional college id. Not used to sign in.">
                  <Input size="lg" id="s-roll" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
                </FormField>
              </FormSection>

              <FormSectionDivider />

              <FormSection title="Personal details" columns={3}>
                <FormField id="s-dob" label="Date of birth" required>
                  <Input size="lg" id="s-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
                </FormField>
                <FormField id="s-phone" label="Phone" required>
                  <Input size="lg" id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </FormField>
                <FormField id="s-gender" label="Gender">
                  <FormSelect id="s-gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select" />
                </FormField>
              </FormSection>

              <FormSectionDivider />

              <FormSection
                title="Placement"
                description="Class is optional — place them now, or later from the roster."
              >
                <FormField id="s-program" label="Program" required>
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
                </FormField>
                <FormField label="Class">
                  <ClassCascade
                    key={programId || "none"}
                    classes={classesInProgram}
                    onChange={setClassId}
                    loading={classes.isPending}
                    disabled={programId === ""}
                    idPrefix="s"
                  />
                </FormField>
              </FormSection>

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
        {/* Same three sections as the create dialog, deliberately — the two are
            the same form and should read identically. The sign-in group is
            first and named so an admin editing a phone number cannot change a
            login handle without noticing which box they are in. */}
        <form id="edit-student-form" onSubmit={submit} className="flex flex-col gap-5">
          <FormSection title="Sign-in details" columns={2}>
            <FormField id="e-name" label="Full name" required className="sm:col-span-2">
              <Input size="lg" id="e-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </FormField>
            <FormField id="e-reg" label="Register number" required>
              <Input size="lg" id="e-reg" value={registerNumber} onChange={(e) => setRegisterNumber(e.target.value)} required />
            </FormField>
            <FormField id="e-email" label="Email" required>
              <Input size="lg" id="e-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </FormField>
            {identityChanged && (
              <Alert variant="warning" className="text-xs sm:col-span-2">
                <AlertDescription>
                  {registerChanged && emailChanged
                    ? "This changes both sign-in details. "
                    : registerChanged
                      ? "This changes the register number they sign in with. "
                      : "This changes the email their account authenticates with. "}
                  Tell {student.displayName} before saving — their password is unchanged.
                </AlertDescription>
              </Alert>
            )}
          </FormSection>

          <FormSectionDivider />

          <FormSection title="Personal details" columns={3}>
            <FormField id="e-roll" label="Roll number">
              <Input size="lg" id="e-roll" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
            </FormField>
            <FormField id="e-phone" label="Phone" required>
              <Input size="lg" id="e-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </FormField>
            <FormField id="e-dob" label="Date of birth" required>
              <Input size="lg" id="e-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
            </FormField>
            <FormField id="e-gender" label="Gender">
              <FormSelect id="e-gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select" />
            </FormField>
          </FormSection>

          <FormSectionDivider />

          <FormSection
            title="Placement & status"
            description="A non-active status disables sign-in until it is set back to Active."
            columns={2}
          >
            <FormField id="e-status" label="Status" required>
              <FormSelect
                id="e-status"
                value={status}
                onChange={(v) => setStatus(v as StudentStatus)}
                options={STATUS_OPTIONS}
                placeholder="Select"
              />
            </FormField>
            {/* ClassCascade renders its own Year + Section pair, so it takes the
                full row rather than sitting in one column. */}
            <FormField label="Class" className="sm:col-span-2">
              <ClassCascade
                classes={classesInProgram}
                initialClassId={currentClassId}
                onChange={setClassId}
                loading={classes.isPending}
                idPrefix="e"
              />
            </FormField>
          </FormSection>

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
