// /faculty — faculty management for Super Admin (all programs) and HOD (their own
// program only). The (app) layout gives auth + shell; here we add the role gate
// (UX — the API re-checks every request, scoping HOD to their program). Thin
// page: it mounts the feature manager.
//
// The page is also where auth meets the feature: it reads the session and hands
// the manager an `isInstitutionScoped` flag, so the feature never has to import
// the auth feature's hooks (features must not import each other — CLAUDE.md).
"use client";

import { AuthGate } from "@/features/auth/components/auth-gate";
import { useMe } from "@/features/auth/hooks/use-auth";
import { FacultyManager } from "@/features/faculty/components/faculty-manager";

export default function FacultyPage() {
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <FacultyView />
    </AuthGate>
  );
}

// Inside AuthGate, so `me` is already resolved by the time this renders.
function FacultyView() {
  const me = useMe(true);
  // Server-derived from the role's DB scope — not a role-name comparison. Only
  // an institution role spans >1 program, so only they get the Program filter
  // (presentation only; the API scopes every query regardless).
  return <FacultyManager isInstitutionScoped={me.data?.isInstitutionScoped ?? false} />;
}
