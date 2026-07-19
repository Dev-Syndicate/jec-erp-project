// /admin has no page of its own yet — management pages are being rebuilt from
// the new schema. Send it to the dashboard for now.
import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  redirect("/dashboard");
}
