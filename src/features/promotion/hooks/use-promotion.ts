// TanStack Query hooks for the Promotion feature. The context query is keyed by
// source class; running a promotion invalidates it (and the students list, so the
// new enrollments show) so the screen re-reads.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PromotionInput } from "@/features/promotion/types";
import {
  fetchClassOptions,
  fetchPromotionContext,
  runPromotion,
} from "@/features/promotion/api/promotion-api";

export function usePromotionContext(classId: string | null) {
  return useQuery({
    queryKey: ["promotion", "context", classId],
    queryFn: () => fetchPromotionContext(classId as string),
    enabled: !!classId,
  });
}

export function useClassOptions() {
  return useQuery({ queryKey: ["promotion", "classes"], queryFn: fetchClassOptions, staleTime: 5 * 60_000 });
}

export function useRunPromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PromotionInput) => runPromotion(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["promotion", "context", input.sourceClassId] });
      qc.invalidateQueries({ queryKey: ["students", "list"] });
    },
  });
}
