// Client fetcher for staff provisioning — POST /api/users through the
// authenticated apiFetch. Students are bulk-imported elsewhere; this form
// handles individual staff (HOD/Teacher).
"use client";

import { apiFetch } from "@/lib/api-client";
import type { ProvisionStaffInput, ProvisionedUser } from "@/features/roles/types";

export async function provisionStaff(input: ProvisionStaffInput): Promise<ProvisionedUser> {
  return apiFetch<ProvisionedUser>("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
