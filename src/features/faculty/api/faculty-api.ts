// Client-side fetchers for the faculty feature — list, load one, save profile.
// All authenticated via apiFetch (Bearer token).
"use client";

import { apiFetch } from "@/lib/api-client";
import type {
  FacultyDetail,
  FacultyListItem,
  FacultyProfileInput,
} from "@/features/faculty/types";

export async function listFaculty(): Promise<FacultyListItem[]> {
  const { faculty } = await apiFetch<{ faculty: FacultyListItem[] }>("/api/faculty");
  return faculty;
}

export function getFaculty(id: string): Promise<FacultyDetail> {
  return apiFetch<FacultyDetail>(`/api/faculty/${id}`);
}

/** Save the faculty profile. Sends "" as null for optional fields. */
export function saveFacultyProfile(
  id: string,
  values: FacultyProfileInput,
): Promise<{ ok: true }> {
  const payload = {
    designation: values.designation,
    staffId: values.staffId,
    phone: values.phone,
    emergencyPhone: values.emergencyPhone || null,
    gender: values.gender || null,
    dateOfBirth: values.dateOfBirth || undefined,
    maritalStatus: values.maritalStatus || null,
    fatherName: values.fatherName || null,
    motherName: values.motherName || null,
  };
  return apiFetch<{ ok: true }>(`/api/faculty/${id}/profile`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** Regenerate a staff member's temporary password. Reveals it once. */
export function regenerateFacultyPassword(id: string): Promise<{ ok: true; tempPassword: string }> {
  return apiFetch<{ ok: true; tempPassword: string }>(
    `/api/faculty/${id}/regenerate-password`,
    { method: "POST" },
  );
}
