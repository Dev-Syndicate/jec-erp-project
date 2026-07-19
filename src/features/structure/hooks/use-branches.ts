// TanStack Query hooks for Branches — the Structure feature's data access. One
// query key (["structure", "branches"]); every mutation invalidates it so the
// table reflects the server after any change.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { BranchInput } from "@/features/structure/types";
import {
  createBranch,
  deleteBranch,
  fetchBranches,
  updateBranch,
} from "@/features/structure/api/branch-api";

const BRANCHES_KEY = ["structure", "branches"] as const;

export function useBranches() {
  return useQuery({
    queryKey: BRANCHES_KEY,
    queryFn: fetchBranches,
    staleTime: 30_000,
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BranchInput) => createBranch(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: BRANCHES_KEY }),
  });
}

export function useUpdateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<BranchInput> & { isActive?: boolean } }) =>
      updateBranch(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: BRANCHES_KEY }),
  });
}

export function useDeleteBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBranch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: BRANCHES_KEY }),
  });
}
