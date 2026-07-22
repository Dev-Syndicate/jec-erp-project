// Picks the right landing for the signed-in user: a STUDENT gets their portal
// (attendance / timetable / marks); staff get their live Overview (today's
// classes / snapshot / quick links). Auth + profile are already resolved by the
// (app) layout's AuthGate, so me.data is available here without a loading flash.
"use client";

import { useFirebaseUser, useMe } from "@/features/auth/hooks/use-auth";
import { StaffDashboard } from "@/features/dashboard/components/staff-dashboard";
import { StudentDashboard } from "@/features/student-portal/components/student-dashboard";

export function DashboardRouter() {
  const { firebaseUser } = useFirebaseUser();
  const me = useMe(!!firebaseUser);

  if (me.data?.roles.includes("Student")) return <StudentDashboard />;
  return <StaffDashboard firstName={me.data?.displayName.split(" ")[0]} />;
}
