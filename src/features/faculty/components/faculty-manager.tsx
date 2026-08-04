// Faculty management — provision accounts, list faculty (program-scoped), edit
// details, toggle active status (which enables/disables login), and reissue a
// temp password. Super-Admin only (page gates with AuthGate; the API re-checks).
// The temp password is shown exactly once on create/regenerate — the admin must
// deliver it before closing. Faculty log in with their email; no enrollment.
"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, KeyRound, Copy, Check, Search } from "lucide-react";

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
import { DepartmentSelect } from "@/components/department-select";
import type {
  Faculty,
  Gender,
  MaritalStatus,
  Role,
} from "@/features/faculty/types";
import { FormSelect } from "@/features/faculty/components/form-select";
import {
  useCreateFaculty,
  useDepartmentOptions,
  useFaculty,
  useRegeneratePassword,
  useRoles,
  useUpdateFaculty,
} from "@/features/faculty/hooks/use-faculty";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}
const isoToDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const PAGE_SIZE = 50;
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

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

// A single toggle in the role filter row. Active reads as a filled brand pill;
// inactive is a quiet outline.
function RolePill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          : "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted"
      }
    >
      {label}
    </button>
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

// Multi-select role picker (toggle pills). Roles are configurable data, so this
// renders whatever /api/roles returns — the seeded HOD/Faculty now, plus any
// custom role the admin adds later. A faculty member can hold more than one.
function RoleChecklist({
  roles,
  selected,
  onToggle,
  loading,
}: {
  roles: Role[];
  selected: string[];
  onToggle: (id: string) => void;
  loading: boolean;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading roles…</p>;
  if (roles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No assignable roles yet. Seed the RBAC roles first.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Roles">
      {roles.map((r) => (
        <RolePill
          key={r.id}
          label={r.name}
          active={selected.includes(r.id)}
          onClick={() => onToggle(r.id)}
        />
      ))}
    </div>
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
 * `isInstitutionScoped` decides whether the Department filter is worth showing —
 * an institution role (Super Admin) spans every department; a scoped role has
 * exactly one. Passed in by the page rather than read here, because a feature
 * must not import another feature's hooks (CLAUDE.md).
 *
 * Presentation only: /api/faculty scopes the list to the caller's own department
 * independently, so this is never what keeps data safe.
 */
export function FacultyManager({ isInstitutionScoped = false }: { isInstitutionScoped?: boolean }) {
  const { data: faculty, isPending, isError, error } = useFaculty();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Faculty | null>(null);
  const [resetting, setResetting] = useState<Faculty | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [designationFilter, setDesignationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [page, setPage] = useState(1);

  // The distinct RBAC roles actually present in the list, so the filter only
  // ever offers roles that would return results (e.g. "HOD", "Faculty").
  const roles = useMemo(() => {
    const set = new Set<string>();
    (faculty ?? []).forEach((f) => f.roles.forEach((r) => set.add(r)));
    return [...set].sort();
  }, [faculty]);

  // Departments and designations are derived from the rows on screen for the same
  // reason: never offer a filter value that would return nothing. The list is
  // already department-scoped server-side, so for an HOD this collapses to their
  // own department (and the picker is hidden — see below).
  //
  // Department, not program, is the axis: it is what the server scopes on, and
  // every staff member has one — filtering by program would leave S&H's staff
  // unreachable, since they have none.
  const departmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    (faculty ?? []).forEach((f) => map.set(f.departmentId, f.departmentName));
    return [...map]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [faculty]);

  const designationOptions = useMemo(() => {
    const set = new Set<string>();
    (faculty ?? []).forEach((f) => f.designation && set.add(f.designation));
    return [...set].sort().map((d) => ({ value: d, label: d }));
  }, [faculty]);

  const hasGender = useMemo(() => (faculty ?? []).some((f) => f.gender), [faculty]);

  // Each control below hides when it has fewer than two values to choose from,
  // and its options are derived from the rows currently loaded. So a selection
  // can outlive what justified it: filter by a designation, then edit the only
  // other holder away, and the picker vanishes while the filter keeps silently
  // applying — the list would look unfiltered but wouldn't be.
  //
  // Rather than correcting state in an effect (which costs an extra render and
  // can cascade), the stored value is treated as a REQUEST and the effective
  // one is derived here: a filter only counts while its control is on screen
  // and its value still matches an available option.
  const showDepartmentFilter = isInstitutionScoped && departmentOptions.length > 1;
  const showDesignationFilter = designationOptions.length > 1;
  const showRoleFilter = roles.length > 1;

  const activeDepartment =
    showDepartmentFilter && departmentOptions.some((d) => d.value === departmentFilter)
      ? departmentFilter
      : "";
  const activeDesignation =
    showDesignationFilter && designationOptions.some((d) => d.value === designationFilter)
      ? designationFilter
      : "";
  const activeRole = showRoleFilter && roles.includes(roleFilter) ? roleFilter : "ALL";
  const activeGender = hasGender ? genderFilter : "";

  // Client-side filter (the list is small and fetched whole): text search across
  // the visible fields, intersected with every active filter.
  const filtered = useMemo(() => {
    if (!faculty) return [];
    const q = query.trim().toLowerCase();
    return faculty.filter((f) => {
      const matchesRole = activeRole === "ALL" || f.roles.includes(activeRole);
      const matchesDepartment = !activeDepartment || f.departmentId === activeDepartment;
      const matchesDesignation = !activeDesignation || f.designation === activeDesignation;
      // "Invited" isn't a stored status — it's an ACTIVE account still on its
      // temp password, which is what the Status column renders.
      const matchesStatus =
        !statusFilter ||
        (statusFilter === "INVITED"
          ? f.status === "ACTIVE" && f.mustChangePassword
          : statusFilter === "ACTIVE"
            ? f.status === "ACTIVE" && !f.mustChangePassword
            : f.status === statusFilter);
      const matchesGender = !activeGender || f.gender === activeGender;
      const matchesQuery =
        q === "" ||
        [f.staffId, f.displayName, f.email, f.departmentName, f.designation]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q));
      return (
        matchesRole &&
        matchesDepartment &&
        matchesDesignation &&
        matchesStatus &&
        matchesGender &&
        matchesQuery
      );
    });
  }, [faculty, query, activeRole, activeDepartment, activeDesignation, statusFilter, activeGender]);

  const activeFilterCount =
    (activeRole !== "ALL" ? 1 : 0) +
    (activeDepartment ? 1 : 0) +
    (activeDesignation ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (activeGender ? 1 : 0);

  const clearFilters = () => {
    setRoleFilter("ALL");
    setDepartmentFilter("");
    setDesignationFilter("");
    setStatusFilter("");
    setGenderFilter("");
    setPage(1);
  };

  // Paginate the filtered rows (50/page); currentPage is clamped so it stays
  // valid when a filter shrinks the list below the current page.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + PAGE_SIZE);

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
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, staff ID, email, department…"
                aria-label="Search faculty"
                className="h-10! pl-9"
              />
            </div>
            {showRoleFilter && (
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by role">
                <RolePill
                  label="All"
                  active={activeRole === "ALL"}
                  onClick={() => {
                    setRoleFilter("ALL");
                    setPage(1);
                  }}
                />
                {roles.map((r) => (
                  <RolePill
                    key={r}
                    label={r}
                    active={activeRole === r}
                    onClick={() => {
                      setRoleFilter(r);
                      setPage(1);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Department / designation / status / gender. The Department picker
              is shown only to an institution role — a scoped user (HOD) receives
              a single department from the API, so the control would be a
              one-entry no-op. Presentation only: the list is scoped server-side
              regardless of what is selected here. */}
          <div className="flex flex-wrap items-end gap-3">
            {showDepartmentFilter && (
              <div className="flex min-w-52 flex-col gap-1.5">
                <Label htmlFor="ff-department" className="text-xs text-muted-foreground">
                  Department
                </Label>
                <FormSelect
                  id="ff-department"
                  value={activeDepartment}
                  onChange={(v) => {
                    setDepartmentFilter(v);
                    setPage(1);
                  }}
                  options={[{ value: "", label: "All departments" }, ...departmentOptions]}
                  placeholder="All departments"
                />
              </div>
            )}

            {showDesignationFilter && (
              <div className="flex min-w-48 flex-col gap-1.5">
                <Label htmlFor="ff-designation" className="text-xs text-muted-foreground">
                  Designation
                </Label>
                <FormSelect
                  id="ff-designation"
                  value={activeDesignation}
                  onChange={(v) => {
                    setDesignationFilter(v);
                    setPage(1);
                  }}
                  options={[{ value: "", label: "All designations" }, ...designationOptions]}
                  placeholder="All designations"
                />
              </div>
            )}

            <div className="flex min-w-36 flex-col gap-1.5">
              <Label htmlFor="ff-status" className="text-xs text-muted-foreground">
                Status
              </Label>
              <FormSelect
                id="ff-status"
                value={statusFilter}
                onChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "All statuses" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "INVITED", label: "Invited" },
                  { value: "INACTIVE", label: "Inactive" },
                ]}
                placeholder="All statuses"
              />
            </div>

            {/* Gender is optional on a faculty profile and the staff sheet has
                no such column, so it is unset for every imported row. Offering
                the filter then would only ever return nothing — show it once at
                least one profile records a gender. */}
            {hasGender && (
              <div className="flex min-w-32 flex-col gap-1.5">
                <Label htmlFor="ff-gender" className="text-xs text-muted-foreground">
                  Gender
                </Label>
                <FormSelect
                  id="ff-gender"
                  value={activeGender}
                  onChange={(v) => {
                    setGenderFilter(v);
                    setPage(1);
                  }}
                  options={[
                    { value: "", label: "All genders" },
                    { value: "MALE", label: "Male" },
                    { value: "FEMALE", label: "Female" },
                    { value: "OTHER", label: "Other" },
                  ]}
                  placeholder="All genders"
                />
              </div>
            )}

            {activeFilterCount > 0 && (
              <Button variant="ghost" className="h-10!" onClick={clearFilters}>
                Clear{activeFilterCount > 1 ? ` (${activeFilterCount})` : ""}
              </Button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <p className="text-sm text-muted-foreground">
                No faculty match the current filters.
              </p>
            </div>
          ) : (
            <div className="rounded-xl ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-0 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-xs">{f.staffId}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{f.displayName}</span>
                      <span className="text-xs text-muted-foreground">{f.email}</span>
                    </div>
                  </TableCell>
                  {/* Who employs them. The code alone is enough at a glance
                      ("CSE", "S&H"); the full name is the select's job. */}
                  <TableCell className="text-muted-foreground">{f.departmentCode}</TableCell>
                  <TableCell className="text-muted-foreground">{f.designation}</TableCell>
                  <TableCell>
                    {f.roles.length ? (
                      <div className="flex flex-wrap gap-1">
                        {f.roles.map((r) => (
                          <span
                            key={r}
                            className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
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

          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Showing {startIdx + 1}–{startIdx + pageItems.length} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <span className="font-mono text-xs">
                  Page {currentPage} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={currentPage >= pageCount}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
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
  const departments = useDepartmentOptions();
  const roles = useRoles();
  const activeDepartments = (departments.data ?? []).filter((d) => d.isActive);
  const roleOptions = roles.data ?? [];

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [designation, setDesignation] = useState("");
  const [phone, setPhone] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  // null = untouched → default to the "Faculty" role once roles load (derived,
  // so no setState-in-effect). Toggling sets an explicit list.
  const [roleIds, setRoleIds] = useState<string[] | null>(null);
  const facultyRoleId = roleOptions.find((r) => r.name === "Faculty")?.id ?? "";
  const selectedRoleIds = roleIds ?? (facultyRoleId ? [facultyRoleId] : []);
  const toggleRole = (id: string) =>
    setRoleIds((prev) => {
      const base = prev ?? (facultyRoleId ? [facultyRoleId] : []);
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });

  // On success we swap the form for the one-time password reveal.
  const created = create.data;

  const valid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    displayName.trim() !== "" &&
    // The employing department is the whole scope of a staff account — nothing
    // else to reconcile it against.
    departmentId !== "" &&
    staffId.trim() !== "" &&
    designation.trim() !== "" &&
    phone.trim() !== "" &&
    selectedRoleIds.length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    create.mutate({
      email: email.trim(),
      displayName: displayName.trim(),
      departmentId,
      roleIds: selectedRoleIds,
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
              : "Provision a faculty account against the department that employs them. A temporary password is generated and shown once."}
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
              {/* Department first: employment is the anchor, and it decides
                  whether the program field below exists at all. */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="f-department">Department</Label>
                <DepartmentSelect
                  id="f-department"
                  value={departmentId}
                  onChange={setDepartmentId}
                  departments={activeDepartments}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="f-staff">Staff ID</Label>
                <Input id="f-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)} className="h-10!" required />
              </div>
              <div className="col-span-2 flex flex-col gap-2">
                <Label>Roles</Label>
                <RoleChecklist
                  roles={roleOptions}
                  selected={selectedRoleIds}
                  onToggle={toggleRole}
                  loading={roles.isPending}
                />
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
              {/* Without the department list nothing can be submitted, so say so
                  rather than leaving an empty select. /api/departments is
                  Structure (Super-Admin only), so an HOD lands here. */}
              {departments.isError && (
                <div className="col-span-2">
                  <FormError>
                    Couldn’t load departments — {errorMessage(departments.error)}
                  </FormError>
                </div>
              )}
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
  const departments = useDepartmentOptions();
  const roles = useRoles();
  const roleOptions = roles.data ?? [];
  const [departmentId, setDepartmentId] = useState(faculty.departmentId);
  const [displayName, setDisplayName] = useState(faculty.displayName);
  // Identity fields. Only email is a credential — faculty sign in with it
  // directly (no register-number step), so a change is flagged before saving.
  // staffId is a college id and touches nothing but its own unique constraint.
  const [staffId, setStaffId] = useState(faculty.staffId);
  const [email, setEmail] = useState(faculty.email);
  const [designation, setDesignation] = useState(faculty.designation);
  const [phone, setPhone] = useState(faculty.phone);
  const [emergencyPhone, setEmergencyPhone] = useState(faculty.emergencyPhone ?? "");
  const [gender, setGender] = useState(faculty.gender ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(isoToDateInput(faculty.dateOfBirth));
  const [maritalStatus, setMaritalStatus] = useState(faculty.maritalStatus ?? "");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">(faculty.status);

  // Current roles are stored as names on the faculty row; map to ids via the
  // loaded role list. null = untouched → show the current set (derived, no effect).
  const initialRoleIds = roleOptions.filter((r) => faculty.roles.includes(r.name)).map((r) => r.id);
  const [roleIds, setRoleIds] = useState<string[] | null>(null);
  const selectedRoleIds = roleIds ?? initialRoleIds;
  const toggleRole = (id: string) =>
    setRoleIds((prev) => {
      const base = prev ?? initialRoleIds;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  const rolesChanged = roleIds !== null && !sameSet(selectedRoleIds, initialRoleIds);

  const staffIdChanged = staffId.trim() !== faculty.staffId;
  const emailChanged = email.trim().toLowerCase() !== faculty.email.toLowerCase();

  // The department they're employed by must stay selectable even if it has since
  // been deactivated, or opening the dialog would blank the field and the form
  // would demand a move nobody asked for. Also covers the degenerate case where
  // the list hasn't resolved: the field still shows the truth and offers no move.
  const activeDepartments = useMemo(() => {
    const loaded = (departments.data ?? []).filter(
      (d) => d.isActive || d.id === faculty.departmentId,
    );
    return loaded.some((d) => d.id === faculty.departmentId)
      ? loaded
      : [
          ...loaded,
          {
            id: faculty.departmentId,
            name: faculty.departmentName,
            code: faculty.departmentCode,
            isActive: true,
            // Unknown from here; the pair hook derives "runs no award" from the
            // programs actually on offer, so this value is never read.
            programCount: 0,
          },
        ];
  }, [departments.data, faculty.departmentId, faculty.departmentName, faculty.departmentCode]);

  const valid =
    displayName.trim() !== "" &&
    designation.trim() !== "" &&
    phone.trim() !== "" &&
    // The employing department is the only scope a staff account has, and it may
    // never be blanked — the server rejects an empty one too.
    departmentId !== "" &&
    staffId.trim() !== "" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    // Until /api/roles resolves, roleOptions is empty, so initialRoleIds is []
    // and the current roles can't be represented. Editing then would post an
    // empty/partial role set and silently strip roles the user never touched.
    roles.isSuccess &&
    selectedRoleIds.length > 0;

  // Only sent when it actually changed — a move re-scopes the account and busts
  // the auth cache, so don't trigger it needlessly.
  const departmentChanged = departmentId !== faculty.departmentId;

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
          // Identity fields only when changed — an unchanged email would
          // otherwise cost a pointless Firebase round-trip on every save.
          ...(staffIdChanged ? { staffId: staffId.trim() } : {}),
          ...(emailChanged ? { email: email.trim().toLowerCase() } : {}),
          ...(departmentChanged ? { departmentId } : {}),
          ...(rolesChanged ? { roleIds: selectedRoleIds } : {}),
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit {faculty.displayName}</DialogTitle>
          <DialogDescription>
            Update details, employing department or active status. Moving them to another
            department re-scopes the account, and takes their program with it. An inactive status
            disables sign-in until set back to Active. Email is the address this account signs in
            with.
          </DialogDescription>
        </DialogHeader>
        {/* Landscape: 3 columns on desktop, 1 on narrow screens — matches the
            student dialogs so every edit form reads the same way. */}
        <form id="edit-faculty-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ef-name">Full name</Label>
            <Input id="ef-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-10!" required />
          </div>
          {/* Department before program: it's who employs them, and it decides
              whether the program field beside it exists at all. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="ef-department">Department</Label>
            <DepartmentSelect
              id="ef-department"
              value={departmentId}
              onChange={setDepartmentId}
              departments={activeDepartments}
            />
          </div>
          {/* Staff ID + email. Only the email is a credential, so only that one
              raises a warning — a staff ID change is administrative. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="ef-staff">Staff ID</Label>
            <Input id="ef-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)} className="h-10!" required />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="ef-email">Email</Label>
            <Input id="ef-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10!" required />
          </div>
          {emailChanged && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 sm:col-span-3 dark:text-amber-200">
              This changes the email {faculty.displayName} signs in with. Tell them before saving —
              their password is unchanged.
            </div>
          )}
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
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Roles</Label>
            <RoleChecklist
              roles={roleOptions}
              selected={selectedRoleIds}
              onToggle={toggleRole}
              loading={roles.isPending}
            />
          </div>
          <div className="flex flex-col gap-2">
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
            <div className="sm:col-span-3">
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
