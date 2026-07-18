// TanStack Query hooks for bulk student import.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listImportBatches,
  regenerateBatch,
  regenerateStudentPassword,
  uploadStudentSheet,
} from "@/features/students/api/import-api";

export function useImportBatches() {
  return useQuery({ queryKey: ["import-batches"], queryFn: listImportBatches });
}

export function useUploadStudentSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, departmentId }: { file: File; departmentId: string }) =>
      uploadStudentSheet(file, departmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["import-batches"] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

export function useRegenerateBatch() {
  return useMutation({ mutationFn: (batchId: string) => regenerateBatch(batchId) });
}

export function useRegenerateStudentPassword(studentId: string) {
  return useMutation({ mutationFn: () => regenerateStudentPassword(studentId) });
}
