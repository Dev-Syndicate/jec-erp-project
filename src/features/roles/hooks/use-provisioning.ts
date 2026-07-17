// TanStack mutation for provisioning staff accounts.
"use client";

import { useMutation } from "@tanstack/react-query";

import { provisionStaff } from "@/features/roles/api/provisioning-api";
import type { ProvisionStaffInput } from "@/features/roles/types";

export function useProvisionStaff() {
  return useMutation({
    mutationFn: (input: ProvisionStaffInput) => provisionStaff(input),
  });
}
