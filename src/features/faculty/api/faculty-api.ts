// Typed client fetchers for the Faculty feature. Everything goes through apiFetch
// (Firebase Bearer token). The department + program option fetchers hit the shared
// /api/departments and /api/programs endpoints directly and map to this feature's
// own picker types — features must not import each other, so we don't reuse the
// structure feature's hooks/types.
"use client";

import { apiFetch } from "@/lib/api-client";
import type {
  Attachment,
  AttachmentInput,
  DepartmentOption,
  Faculty,
  FacultyInput,
  FacultyPatch,
  ImportPreview,
  ImportResult,
  ProvisionResult,
  Role,
} from "@/features/faculty/types";

// --- Faculty --------------------------------------------------------------
export function fetchFaculty(): Promise<Faculty[]> {
  return apiFetch<Faculty[]>("/api/faculty");
}

export function createFaculty(input: FacultyInput): Promise<ProvisionResult> {
  return apiFetch<ProvisionResult>("/api/faculty", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateFaculty(id: string, patch: FacultyPatch): Promise<Faculty> {
  return apiFetch<Faculty>(`/api/faculty/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function regeneratePassword(id: string): Promise<{ tempPassword: string }> {
  return apiFetch<{ tempPassword: string }>(`/api/faculty/${id}/regenerate-password`, {
    method: "POST",
  });
}

// Assignable roles for the role picker (dynamic — reflects any roles the admin
// creates). Returned as-is; the shape already matches the client Role type.
export function fetchRoles(): Promise<Role[]> {
  return apiFetch<Role[]>("/api/roles");
}

// --- Bulk import ----------------------------------------------------------
// FormData bodies: apiFetch leaves Content-Type unset so the browser adds the
// multipart boundary. dryRun=true parses only (preview); omitting it commits.
//
// Roles are sent from the UI, never read from the sheet — the server puts them
// through the same subset check as a single add, so an importer can't mint an
// account more powerful than its creator.
function importForm(
  file: File,
  departmentId: string,
  roleIds: string[],
  dryRun: boolean,
): FormData {
  const form = new FormData();
  form.append("file", file);
  if (departmentId) form.append("departmentId", departmentId);
  for (const id of roleIds) form.append("roleIds", id);
  if (dryRun) form.append("dryRun", "true");
  return form;
}

// Preview only parses the file — no department or roles needed yet.
export function previewFacultyImport(file: File): Promise<ImportPreview> {
  return apiFetch<ImportPreview>("/api/faculty/import", {
    method: "POST",
    body: importForm(file, "", [], true),
  });
}

export function commitFacultyImport(
  file: File,
  departmentId: string,
  roleIds: string[],
): Promise<ImportResult> {
  return apiFetch<ImportResult>("/api/faculty/import", {
    method: "POST",
    body: importForm(file, departmentId, roleIds, false),
  });
}

// --- Cross-department attachments ------------------------------------------
// Attachments for the ACTIVE semester only — the server scopes to it, so there's
// no semester parameter to pass here.
export function fetchAttachments(): Promise<Attachment[]> {
  return apiFetch<Attachment[]>("/api/faculty/attachments");
}

export function createAttachment(input: AttachmentInput): Promise<Attachment> {
  return apiFetch<Attachment>("/api/faculty/attachments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Resolves with the number of timetable slots the lecturer still held in that
// department — those cells stay on the grid but can't be edited until the
// lecturer is re-attached, so the caller surfaces the count rather than
// implying the removal was consequence-free.
export function deleteAttachment(id: string): Promise<{ ok: true; strandedSlots: number }> {
  return apiFetch<{ ok: true; strandedSlots: number }>(`/api/faculty/attachments/${id}`, {
    method: "DELETE",
  });
}

// --- Picker options (mapped from the shared structure endpoints) -----------
// No program fetcher: a staff account carries no award, so the only picker this
// feature needs is the department one below.

// The departments a staff account can be employed by. programCount is what the
// dialogs read to decide whether a program is required at all — a department
// running no award (S&H) takes none, and the API rejects one.
type RawDepartment = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  programCount: number;
};

export async function fetchDepartmentOptions(): Promise<DepartmentOption[]> {
  const departments = await apiFetch<RawDepartment[]>("/api/departments");
  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    isActive: d.isActive,
    programCount: d.programCount,
  }));
}
