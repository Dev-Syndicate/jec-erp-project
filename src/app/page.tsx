// Root route — a thin auth-aware redirector, no UI of its own. Signed-in and
// provisioned users go to /dashboard; everyone else to /login. The forced
// first-login reset is enforced on /login and by AuthGate, so this only needs
// the coarse signed-in/out decision. (The old theme preview now lives at /theme.)
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useFirebaseUser, useMe } from "@/features/auth/hooks/use-auth";

export default function Home() {
  const router = useRouter();
  const { firebaseUser, loading } = useFirebaseUser();
  const signedIn = !!firebaseUser;
  const me = useMe(signedIn);

  useEffect(() => {
    if (loading) return;
    if (!signedIn) {
      router.replace("/login");
      return;
    }
    // Signed in: wait for the profile, then route on reset state.
    if (me.isPending) return;
    if (me.data && !me.data.mustChangePassword) router.replace("/dashboard");
    else router.replace("/login");
  }, [loading, signedIn, me.isPending, me.data, router]);

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        Loading…
      </div>
    </main>
  );
}
