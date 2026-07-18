// /admin has no page of its own — it's split into Departments / Faculty /
// Students. Send it to the first management page.
import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  redirect("/admin/departments");
}
