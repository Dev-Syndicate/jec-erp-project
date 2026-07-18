// TanStack mutation for provisioning staff accounts.
"use client";

import { useMutation } from "@tanstack/react-query";

import { provisionStaff, provisionStudent } from "@/features/roles/api/provisioning-api";
import type { ProvisionStaffInput, ProvisionStudentInput } from "@/features/roles/types";

export function useProvisionStaff() {
  return useMutation({
    mutationFn: (input: ProvisionStaffInput) => provisionStaff(input),
  });
}

export function useProvisionStudent() {
  return useMutation({
    mutationFn: (input: ProvisionStudentInput) => provisionStudent(input),
  });
}
