// TanStack Query hooks — the departments feature's data access.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listDepartments, createDepartment } from "@/features/departments/api/departments-api";
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
