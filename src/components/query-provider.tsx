// TanStack Query provider — app-wide client cache for data fetching.
// Cross-cutting (used by every feature's hooks), so it lives in components/,
// not in a single feature.
"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // One client per browser session; useState keeps it stable across re-renders.
  const [client] = useState(() => {
    // GLOBAL FRESHNESS: after ANY successful mutation, invalidate every query. ERP
    // data is cross-linked (a Subject feeds the Timetable + Marks; a Class feeds
    // Attendance + Roster; …), and per-feature invalidation kept leaving OTHER
    // features' views stale until a manual reload. One app-wide rule fixes that
    // class of bug once — no per-mutation dependency map to maintain and forget.
    // It's cheap: invalidate() only marks queries stale; TanStack Query then
    // refetches ONLY the ones currently mounted (what you're looking at), not the
    // whole cache, and writes in an ERP are infrequent.
    const qc: QueryClient = new QueryClient({
      mutationCache: new MutationCache({
        onSuccess: () => {
          qc.invalidateQueries();
        },
      }),
      defaultOptions: {
        queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
      },
    });
    return qc;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
