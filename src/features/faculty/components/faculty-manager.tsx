// Faculty management — provision accounts, list faculty (program-scoped), edit
// details, toggle active status (which enables/disables login), and reissue a
// temp password. Super-Admin only (page gates with AuthGate; the API re-checks).
// The temp password is shown exactly once on create/regenerate — the admin must
// deliver it before closing. Faculty log in with their email; no enrollment.
"use client";

import { useState } from "react";
import { Plus, Pencil, KeyRound, Copy, Check } from "lucide-react";

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
import type { Faculty, Gender, MaritalStatus } from "@/features/faculty/types";
import { FormSelect } from "@/features/faculty/components/form-select";
import {
  useCreateFaculty,
  useFaculty,
  useProgramOptions,
  useRegeneratePassword,
  useUpdateFaculty,
} from "@/features/faculty/hooks/use-faculty";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}
const isoToDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];
const MARITAL_OPTIONS = [
  { value: "SINGLE", label: "Single" },
  { value: "MARRIED", label: "Married" },
  { value: "OTHER", label: "Other" },
];
const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

function StatusPill({ faculty }: { faculty: Faculty }) {
  // Login disabled reads as muted; active faculty still on their temp password
  // get a distinct "invited" hint.
  if (faculty.status !== "ACTIVE") {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        Inactive
      </span>
    );
  }
  if (faculty.mustChangePassword) {
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

export function FacultyManager() {
  const { data: faculty, isPending, isError, error } = useFaculty();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Faculty | null>(null);
  const [resetting, setResetting] = useState<Faculty | null>(null);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="People · Faculty"
          title="Faculty"
          description="Provision faculty accounts. Faculty sign in with their email."
        />
        <div className="flex items-center gap-2">
          <Button onClick={() => setCreating(true)} data-icon="inline-start">
            <Plus />
            Add faculty
          </Button>
        </div>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading faculty…</p>
      ) : isError ? (
        <FormError>{errorMessage(error)}</FormError>
      ) : faculty.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No faculty yet.</p>
          <Button variant="outline" onClick={() => setCreating(true)} data-icon="inline-start">
            <Plus />
            Add the first faculty member
          </Button>
        </div>
      ) : (
        <div className="rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {faculty.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-xs">{f.staffId}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{f.displayName}</span>
                      <span className="text-xs text-muted-foreground">{f.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{f.programLabel ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{f.designation}</TableCell>
                  <TableCell>
                    <StatusPill faculty={f} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {f.mustChangePassword && f.status === "ACTIVE" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setResetting(f)}
                          aria-label="Reissue temp password"
                          title="Reissue temp password"
                        >
                          <KeyRound />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(f)}
                        aria-label="Edit faculty"
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

      {creating && <CreateFacultyDialog onClose={() => setCreating(false)} />}
      {editing && <EditFacultyDialog faculty={editing} onClose={() => setEditing(null)} />}
      {resetting && <RegenerateDialog faculty={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function CreateFacultyDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateFaculty();
  const programs = useProgramOptions();
  const activePrograms = (programs.data ?? []).filter((p) => p.isActive);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [programId, setProgramId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [designation, setDesignation] = useState("");
  const [phone, setPhone] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");

  // On success we swap the form for the one-time password reveal.
  const created = create.data;

  const valid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    displayName.trim() !== "" &&
    programId !== "" &&
    staffId.trim() !== "" &&
    designation.trim() !== "" &&
    phone.trim() !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    create.mutate({
      email: email.trim(),
      displayName: displayName.trim(),
      programId,
      staffId: staffId.trim(),
      designation: designation.trim(),
      phone: phone.trim(),
      emergencyPhone: emergencyPhone.trim() || null,
      gender: (gender || null) as Gender | null,
      dateOfBirth: dateOfBirth || null,
      maritalStatus: (maritalStatus || null) as MaritalStatus | null,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{created ? "Faculty created" : "Add faculty"}</DialogTitle>
          <DialogDescription>
            {created
              ? "The account is ready. Save the temporary password below."
              : "Provision a faculty account. A temporary password is generated and shown once."}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <>
            <TempPasswordPanel name={created.faculty.displayName} password={created.tempPassword} />
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Landscape 2-column layout so the form stays short. */}
            <form id="faculty-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="f-name">Full name</Label>
                <Input id="f-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-10!" autoFocus required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="f-email">Email</Label>
                <Input id="f-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="h-10!" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="f-program">Program</Label>
                <FormSelect
                  id="f-program"
                  value={programId}
                  onChange={setProgramId}
                  options={activePrograms.map((p) => ({ value: p.id, label: p.label }))}
                  placeholder={programs.isPending ? "Loading…" : "Select a program"}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="f-staff">Staff ID</Label>
                <Input id="f-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)} className="h-10!" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="f-designation">Designation</Label>
                <Input id="f-designation" value={designation} onChange={(e) => setDesignation(e.target.value)} className="h-10!" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="f-phone">Phone</Label>
                <Input id="f-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10!" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="f-emergency">Emergency phone (optional)</Label>
                <Input id="f-emergency" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} className="h-10!" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="f-dob">Date of birth (optional)</Label>
                <Input id="f-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="h-10!" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="f-gender">Gender (optional)</Label>
                <FormSelect id="f-gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="f-marital">Marital status (optional)</Label>
                <FormSelect id="f-marital" value={maritalStatus} onChange={setMaritalStatus} options={MARITAL_OPTIONS} placeholder="Select" />
              </div>
              {create.isError && (
                <div className="col-span-2">
                  <FormError>{errorMessage(create.error)}</FormError>
                </div>
              )}
            </form>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={create.isPending}>
                Cancel
              </Button>
              <Button type="submit" form="faculty-form" disabled={!valid || create.isPending}>
                {create.isPending ? "Creating…" : "Create faculty"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditFacultyDialog({ faculty, onClose }: { faculty: Faculty; onClose: () => void }) {
  const update = useUpdateFaculty();
  const programs = useProgramOptions();
  const [programId, setProgramId] = useState(faculty.programId ?? "");
  const [displayName, setDisplayName] = useState(faculty.displayName);
  const [designation, setDesignation] = useState(faculty.designation);
  const [phone, setPhone] = useState(faculty.phone);
  const [emergencyPhone, setEmergencyPhone] = useState(faculty.emergencyPhone ?? "");
  const [gender, setGender] = useState(faculty.gender ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(isoToDateInput(faculty.dateOfBirth));
  const [maritalStatus, setMaritalStatus] = useState(faculty.maritalStatus ?? "");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">(faculty.status);

  const valid =
    displayName.trim() !== "" && designation.trim() !== "" && phone.trim() !== "" && programId !== "";

  // Only include programId when it actually changed — a program move re-scopes the
  // account and busts the auth cache, so don't trigger it needlessly.
  const activePrograms = (programs.data ?? []).filter((p) => p.isActive || p.id === programId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    update.mutate(
      {
        id: faculty.id,
        patch: {
          displayName: displayName.trim(),
          designation: designation.trim(),
          phone: phone.trim(),
          emergencyPhone: emergencyPhone.trim() || null,
          gender: (gender || null) as Gender | null,
          dateOfBirth: dateOfBirth || null,
          maritalStatus: (maritalStatus || null) as MaritalStatus | null,
          status,
          ...(programId && programId !== faculty.programId ? { programId } : {}),
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {faculty.displayName}</DialogTitle>
          <DialogDescription>
            Update details, program or active status. Moving a program re-scopes the account. An
            inactive status disables sign-in until set back to Active. Email and staff ID aren’t
            editable here.
          </DialogDescription>
        </DialogHeader>
        <form id="edit-faculty-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ef-name">Full name</Label>
            <Input id="ef-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-10!" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ef-program">Program</Label>
            <FormSelect
              id="ef-program"
              value={programId}
              onChange={setProgramId}
              options={activePrograms.map((p) => ({ value: p.id, label: p.label }))}
              placeholder={programs.isPending ? "Loading…" : "Select a program"}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ef-designation">Designation</Label>
            <Input id="ef-designation" value={designation} onChange={(e) => setDesignation(e.target.value)} className="h-10!" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ef-phone">Phone</Label>
            <Input id="ef-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10!" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ef-emergency">Emergency phone</Label>
            <Input id="ef-emergency" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} className="h-10!" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ef-dob">Date of birth</Label>
            <Input id="ef-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="h-10!" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ef-gender">Gender</Label>
            <FormSelect id="ef-gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ef-marital">Marital status</Label>
            <FormSelect id="ef-marital" value={maritalStatus} onChange={setMaritalStatus} options={MARITAL_OPTIONS} placeholder="Select" />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="ef-status">Status</Label>
            <FormSelect
              id="ef-status"
              value={status}
              onChange={(v) => setStatus(v as "ACTIVE" | "INACTIVE")}
              options={STATUS_OPTIONS}
              placeholder="Select"
            />
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
          <Button type="submit" form="edit-faculty-form" disabled={!valid || update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegenerateDialog({ faculty, onClose }: { faculty: Faculty; onClose: () => void }) {
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
              : `Generate a fresh temporary password for ${faculty.displayName}. Only works while they haven't set their own yet.`}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <TempPasswordPanel name={faculty.displayName} password={created.tempPassword} />
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
              <Button disabled={regen.isPending} onClick={() => regen.mutate(faculty.id)}>
                {regen.isPending ? "Generating…" : "Reissue password"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
