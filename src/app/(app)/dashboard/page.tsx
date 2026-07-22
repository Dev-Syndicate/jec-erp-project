// Protected landing route. Auth + shell come from the (app) group layout, so this
// file is thin: it defers to the router, which shows the student portal for a
// student and the work overview for staff.
import { DashboardRouter } from "./dashboard-router";

export default function DashboardPage() {
  return <DashboardRouter />;
}
