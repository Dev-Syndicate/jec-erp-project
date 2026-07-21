// Typed client fetchers for the Promotion feature. Everything goes through
// apiFetch (Firebase Bearer token). The class fetcher hits the shared /api/classes
// endpoint and maps to this feature's own option type — features must not import
// each other.
"use client";

import { apiFetch } from "@/lib/api-client";
import type {
  ClassOption,
  PromotionContext,
  PromotionInput,
  PromotionResult,
} from "@/features/promotion/types";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n: number) => ROMAN[n] ?? String(n);

export function fetchPromotionContext(classId: string): Promise<PromotionContext> {
  return apiFetch<PromotionContext>(`/api/promotion?classId=${encodeURIComponent(classId)}`);
}

export function runPromotion(input: PromotionInput): Promise<PromotionResult> {
  return apiFetch<PromotionResult>("/api/promotion", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

type RawClass = {
  id: string;
  programId: string;
  programLabel: string;
  year: number;
  section: string;
  isActive: boolean;
};

export async function fetchClassOptions(): Promise<ClassOption[]> {
  const classes = await apiFetch<RawClass[]>("/api/classes");
  return classes.map((c) => ({
    id: c.id,
    label: `${c.programLabel} · ${roman(c.year)}-${c.section}`,
    shortLabel: `${roman(c.year)}-${c.section}`,
    programId: c.programId,
    programLabel: c.programLabel,
    isActive: c.isActive,
  }));
}
