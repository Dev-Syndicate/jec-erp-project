// Client-side route protection.
//
// Firebase tokens live in the browser (IndexedDB), not a cookie, so a server
// Proxy/middleware can't see them — the Next docs also say Proxy isn't for
// authorization. So protected routes gate on the client: resolve the Firebase
// session + our /api/auth/me profile, then decide.
//
// Rules (mirrors the PRD: first login forces a reset BEFORE access):
//   - no Firebase session            → redirect to /login
//   - session but no Neon profile    → redirect to /login (identity ≠ account)
//   - mustChangePassword still set    → redirect to /login (the reset lives there)
//   - fully provisioned + reset done  → render the protected content
//
// Server API routes still re-verify every request independently — this gate is
// UX, not the security boundary. A user who bypasses it hits 401/403 anyway.
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useFirebaseUser, useMe } from "@/features/auth/hooks/use-auth";

function FullScreenState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        {children}
      </div>
    </div>
  );
}

export function AuthGate({
  children,
  requireRole,
}: {
  children: React.ReactNode;
  // If set, the user must hold at least one of these roles. Lacking it isn't a
  // "sign in" problem, so we don't redirect — we show a clear denied state (the
  // API enforces the same rule regardless; this is UX).
  requireRole?: string[];
}) {
  const router = useRouter();
  const { firebaseUser, loading } = useFirebaseUser();
  const signedIn = !!firebaseUser;
  const me = useMe(signedIn);

  // Anything short of "fully provisioned and reset done" belongs at /login.
  const blocked =
    !loading &&
    (!signedIn || me.isError || (me.data ? me.data.mustChangePassword : false));

  useEffect(() => {
    if (blocked) router.replace("/login");
  }, [blocked, router]);

  if (loading || (signedIn && me.isPending)) {
    return <FullScreenState>Verifying session…</FullScreenState>;
  }
  if (blocked) {
    return <FullScreenState>Redirecting to sign in…</FullScreenState>;
  }

  // Authenticated but lacking the required role — deny in place, don't bounce.
  if (requireRole && !requireRole.some((r) => me.data?.roles.includes(r))) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-lg font-semibold text-foreground">
            You don’t have access to this page
          </h1>
          <p className="text-sm text-muted-foreground">
            This area is for {requireRole.join(" / ")}. If that’s a mistake, ask an administrator to
            review your role.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
