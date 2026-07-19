// TanStack Query hooks for classes & sections.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createClass, createSection, listClasses } from "@/features/academic/api/classes-api";

export function useClasses(departmentId: string | undefined) {
  return useQuery({
    queryKey: ["classes", departmentId],
    queryFn: () => listClasses(departmentId!),
    enabled: !!departmentId,
  });
}

export function useCreateClass(departmentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createClass(departmentId!, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes", departmentId] }),
  });
}

export function useCreateSection(departmentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ classId, name }: { classId: string; name: string }) =>
      createSection(classId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes", departmentId] }),
  });
}
