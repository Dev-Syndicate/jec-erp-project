// TanStack Query hooks for Departments — the Structure feature's data access. One
// query key (["structure", "departments"]); every mutation invalidates it so the
// pickers reflect the server after any change.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { DepartmentInput } from "@/features/structure/types";
import {
  createDepartment,
  deleteDepartment,
  fetchDepartments,
  updateDepartment,
} from "@/features/structure/api/department-api";

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

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<DepartmentInput> & { isActive?: boolean };
    }) => updateDepartment(id, input),
    // Programs and classes carry a department label, so a rename or deactivate has
    // to reach those lists too — not just the department list itself.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEPARTMENTS_KEY });
      qc.invalidateQueries({ queryKey: ["structure", "programs"] });
      qc.invalidateQueries({ queryKey: ["structure", "classes"] });
    },
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDepartment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
  });
}
