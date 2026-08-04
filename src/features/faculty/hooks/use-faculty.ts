// TanStack Query hooks for the Faculty feature. Mutations invalidate the faculty
// list so it reflects the server (new account, edit, status change). Department
// and program options are their own lightly-cached queries used to populate the
// create/edit dialogs.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { FacultyInput, FacultyPatch } from "@/features/faculty/types";
import {
  createFaculty,
  fetchDepartmentOptions,
  fetchFaculty,
  fetchRoles,
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
