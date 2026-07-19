// Typed client fetchers for Branches. Every call goes through apiFetch, which
// attaches the Firebase Bearer token (CLAUDE.md boundary). The hooks in
// ../hooks wrap these in TanStack Query — components never call these directly.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { Branch, BranchInput } from "@/features/structure/types";

export function fetchBranches(): Promise<Branch[]> {
  return apiFetch<Branch[]>("/api/branches");
}

export function createBranch(input: BranchInput): Promise<Branch> {
  return apiFetch<Branch>("/api/branches", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Partial update — pass only the fields that change (name/code, or isActive to
// deactivate/reactivate).
export function updateBranch(id: string, input: Partial<BranchInput> & { isActive?: boolean }): Promise<Branch> {
  return apiFetch<Branch>(`/api/branches/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteBranch(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/branches/${id}`, { method: "DELETE" });
}
