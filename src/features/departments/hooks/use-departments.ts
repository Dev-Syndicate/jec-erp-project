// TanStack Query hooks — the departments feature's data access.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
} from "@/features/departments/api/departments-api";
import type { CreateDepartmentInput } from "@/features/departments/types";

const DEPARTMENTS_KEY = ["departments"] as const;

export function useDepartments() {
  return useQuery({
    queryKey: DEPARTMENTS_KEY,
    queryFn: listDepartments,
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDepartmentInput) => createDepartment(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: { id: string } & Partial<CreateDepartmentInput> & { isActive?: boolean }) =>
      updateDepartment(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
  });
}

export function useDeactivateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateDepartment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
  });
}
