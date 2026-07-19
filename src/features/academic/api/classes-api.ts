// Client-side fetchers for classes & sections. Authenticated via apiFetch.
"use client";

import { apiFetch } from "@/lib/api-client";
import type { ClassRow, SectionRow } from "@/features/academic/types";

export async function listClasses(departmentId: string): Promise<ClassRow[]> {
  const { classes } = await apiFetch<{ classes: ClassRow[] }>(
    `/api/classes?departmentId=${departmentId}`,
  );
  return classes;
}

export async function createClass(departmentId: string, name: string): Promise<ClassRow> {
  const res = await apiFetch<{ class: ClassRow }>("/api/classes", {
    method: "POST",
    body: JSON.stringify({ departmentId, name }),
  });
  return res.class;
}

export async function createSection(classId: string, name: string): Promise<SectionRow> {
  const { section } = await apiFetch<{ section: SectionRow }>(`/api/classes/${classId}/sections`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return section;
}
