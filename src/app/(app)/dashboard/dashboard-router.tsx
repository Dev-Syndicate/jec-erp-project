// Picks the right landing for the signed-in user: a STUDENT gets their portal
// (attendance / timetable / marks); staff get the work overview. Auth + profile
// are already resolved by the (app) layout's AuthGate, so me.data is available
// here without a loading flash.
"use client";

import { useFirebaseUser, useMe } from "@/features/auth/hooks/use-auth";
import { DashboardHome } from "@/features/auth/components/dashboard-home";
import { StudentDashboard } from "@/features/student-portal/components/student-dashboard";

export function DashboardRouter() {
  const { firebaseUser } = useFirebaseUser();
  const me = useMe(!!firebaseUser);

  if (me.data?.roles.includes("Student")) return <StudentDashboard />;
  return <DashboardHome />;
}
