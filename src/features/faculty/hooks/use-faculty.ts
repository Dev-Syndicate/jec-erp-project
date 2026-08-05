// TanStack Query hooks for the Faculty feature. Mutations invalidate the faculty
// list so it reflects the server (new account, edit, status change). Department
// and program options are their own lightly-cached queries used to populate the
// create/edit dialogs.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AttachmentInput, FacultyInput, FacultyPatch } from "@/features/faculty/types";
import {
  commitFacultyImport,
  createAttachment,
  createFaculty,
  deleteAttachment,
  fetchAttachments,
  fetchDepartmentOptions,
  fetchFaculty,
  fetchRoles,
  fetchStaffCredentials,
  previewFacultyImport,
  regeneratePassword,
  updateFaculty,
} from "@/features/faculty/api/faculty-api";

const FACULTY_KEY = ["faculty", "list"] as const;

export function useFaculty() {
  return useQuery({ queryKey: FACULTY_KEY, queryFn: fetchFaculty, staleTime: 30_000 });
}


/**
 * The employing-department options for the create/edit dialogs.
 *
 * /api/departments is Structure, i.e. Super-Admin only — an HOD reaching this
 * page gets a 403, which is correct (they can only ever employ into their own
 * department, and the API enforces that regardless). `retry: false` keeps that
 * expected rejection from becoming three round-trips, and the dialogs fall back
 * to the department already on the row rather than blocking the form.
 */
export function useDepartmentOptions() {
  return useQuery({
    queryKey: ["faculty", "department-options"],
    queryFn: fetchDepartmentOptions,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useRoles() {
  return useQuery({ queryKey: ["faculty", "roles"], queryFn: fetchRoles, staleTime: 5 * 60_000 });
}

function useInvalidateFaculty() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: FACULTY_KEY });
}

export function useCreateFaculty() {
  const invalidate = useInvalidateFaculty();
  return useMutation({ mutationFn: (input: FacultyInput) => createFaculty(input), onSuccess: invalidate });
}

export function useUpdateFaculty() {
  const invalidate = useInvalidateFaculty();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: FacultyPatch }) => updateFaculty(id, patch),
    onSuccess: invalidate,
  });
}

export function useRegeneratePassword() {
  // No list change — the caller reveals the returned password.
  return useMutation({ mutationFn: (id: string) => regeneratePassword(id) });
}

// Bulk login slips. Invalidates the list: every account it touches has its
// password reset, which re-arms mustChangePassword and so the "Invited" badge.
export function useStaffCredentials() {
  const invalidate = useInvalidateFaculty();
  return useMutation({
    mutationFn: (departmentId?: string) => fetchStaffCredentials(departmentId),
    onSuccess: invalidate,
  });
}

// --- Bulk import ----------------------------------------------------------
// Preview parses only and writes nothing, so it deliberately does NOT invalidate.
export function useFacultyImportPreview() {
  return useMutation({ mutationFn: ({ file }: { file: File }) => previewFacultyImport(file) });
}

export function useFacultyImportCommit() {
  const invalidate = useInvalidateFaculty();
  return useMutation({
    mutationFn: ({
      file,
      departmentId,
      roleIds,
    }: {
      file: File;
      departmentId: string;
      roleIds: string[];
    }) => commitFacultyImport(file, departmentId, roleIds),
    onSuccess: invalidate,
  });
}

// --- Cross-department attachments ------------------------------------------
const ATTACHMENTS_KEY = ["faculty", "attachments"] as const;

export function useAttachments() {
  return useQuery({ queryKey: ATTACHMENTS_KEY, queryFn: fetchAttachments, staleTime: 30_000 });
}

/**
 * Invalidate everything an attachment changes.
 *
 * Not just this feature's list: attaching someone changes WHO THE TIMETABLE AND
 * COVER PICKERS MAY OFFER, and both cache their options for five minutes. Without
 * this, a lecturer you just attached stays missing from those dropdowns until the
 * cache expires — the same "the API accepts them but the UI never shows them"
 * failure this whole slice exists to fix.
 *
 * Cross-feature cache keys are referenced by string here rather than imported:
 * features must not import each other (CLAUDE.md), and a query key is data.
 */
function useInvalidateAttachments() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ATTACHMENTS_KEY });
    void qc.invalidateQueries({ queryKey: ["timetable", "faculty"] });
    void qc.invalidateQueries({ queryKey: ["attendance", "faculty-options"] });
  };
}

export function useCreateAttachment() {
  const invalidate = useInvalidateAttachments();
  return useMutation({
    mutationFn: (input: AttachmentInput) => createAttachment(input),
    onSuccess: invalidate,
  });
}

export function useDeleteAttachment() {
  const invalidate = useInvalidateAttachments();
  return useMutation({ mutationFn: (id: string) => deleteAttachment(id), onSuccess: invalidate });
}
