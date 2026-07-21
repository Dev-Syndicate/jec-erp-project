// TanStack Query hooks for Classes — the Structure feature's data access. One
// query key (["structure", "classes"]); every mutation invalidates it so the
// table reflects the server after any change.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ClassInput } from "@/features/structure/types";
import {
  createClass,
  deleteClass,
  fetchClasses,
  updateClass,
} from "@/features/structure/api/class-api";

const CLASSES_KEY = ["structure", "classes"] as const;

export function useClasses() {
  return useQuery({
    queryKey: CLASSES_KEY,
    queryFn: fetchClasses,
    staleTime: 30_000,
  });
}

export function useCreateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClassInput) => createClass(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLASSES_KEY }),
  });
}

export function useUpdateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<Pick<ClassInput, "year" | "section" | "advisorId">> & { isActive?: boolean };
    }) => updateClass(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLASSES_KEY }),
  });
}

export function useDeleteClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteClass(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLASSES_KEY }),
  });
}
