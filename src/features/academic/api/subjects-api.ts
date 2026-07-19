// Client-side fetchers for the subject catalog. Authenticated via apiFetch.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { NewSubjectInput, Subject } from "@/features/academic/types";

export async function listSubjects(
  departmentId: string,
  includeInactive = true,
): Promise<Subject[]> {
  const { subjects } = await apiFetch<{ subjects: Subject[] }>(
    `/api/subjects?departmentId=${departmentId}&includeInactive=${includeInactive}`,
  );
  return subjects;
}

export async function createSubject(departmentId: string, input: NewSubjectInput): Promise<Subject> {
  const { subject } = await apiFetch<{ subject: Subject }>("/api/subjects", {
    method: "POST",
    body: JSON.stringify({ departmentId, ...input }),
  });
  return subject;
}

export async function setSubjectActive(id: string, isActive: boolean): Promise<Subject> {
  const { subject } = await apiFetch<{ subject: Subject }>(`/api/subjects/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
  return subject;
}
