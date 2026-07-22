// TanStack Query hooks for the Students feature. Mutations invalidate the
// students list so it reflects the server (new account, edit, status change,
// enrollment). Program/class options are their own lightly-cached queries used
// to populate the create + enroll dialogs.
"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { StudentInput, StudentPatch } from "@/features/students/types";
import {
  commitImport,
  createStudent,
  fetchClassOptions,
  fetchProgramOptions,
  fetchStudents,
  previewImport,
  regeneratePassword,
  updateStudent,
} from "@/features/students/api/student-api";

const STUDENTS_KEY = ["students", "list"] as const;

// Server-side paginated + searched. keepPreviousData avoids a blank flash while
// the next page/search loads. Mutations invalidate the STUDENTS_KEY prefix, which
// covers every (page, q) variant.
export function useStudents(page: number, q: string) {
  return useQuery({
    queryKey: [...STUDENTS_KEY, page, q],
    queryFn: () => fetchStudents(page, q),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useProgramOptions() {
  return useQuery({
    queryKey: ["students", "program-options"],
    queryFn: fetchProgramOptions,
    staleTime: 5 * 60_000,
  });
}

export function useClassOptions() {
  return useQuery({
    queryKey: ["students", "class-options"],
    queryFn: fetchClassOptions,
    staleTime: 5 * 60_000,
  });
}

function useInvalidateStudents() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: STUDENTS_KEY });
}

export function useCreateStudent() {
  const invalidate = useInvalidateStudents();
  return useMutation({ mutationFn: (input: StudentInput) => createStudent(input), onSuccess: invalidate });
}

export function useUpdateStudent() {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: StudentPatch }) => updateStudent(id, patch),
    onSuccess: invalidate,
  });
}

export function useRegeneratePassword() {
  // No list change — the caller reveals the returned password.
  return useMutation({ mutationFn: (id: string) => regeneratePassword(id) });
}

// Preview parses only — no list change.
export function useImportPreview() {
  return useMutation({
    mutationFn: ({ file, programId }: { file: File; programId: string }) =>
      previewImport(file, programId),
  });
}

// Commit provisions rows + enrolls them into the chosen class — refresh once done.
export function useImportCommit() {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: ({ file, programId, classId }: { file: File; programId: string; classId: string }) =>
      commitImport(file, programId, classId),
    onSuccess: invalidate,
  });
}
