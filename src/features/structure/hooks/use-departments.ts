// TanStack Query hooks for Departments — the Structure feature's data access. One
// query key (["structure", "departments"]); every mutation invalidates it so the
// pickers reflect the server after any change.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { DepartmentInput } from "@/features/structure/types";
import { createDepartment, fetchDepartments } from "@/features/structure/api/department-api";

const DEPARTMENTS_KEY = ["structure", "departments"] as const;

export function useDepartments() {
  return useQuery({
    queryKey: DEPARTMENTS_KEY,
    queryFn: fetchDepartments,
    staleTime: 30_000,
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DepartmentInput) => createDepartment(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
  });
}
