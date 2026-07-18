// /admin/faculty/[id] — a staff member's profile. Super Admin / HOD.
// Auth + shell from the (app) layout; the API re-checks dept scope on every save.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { FacultyProfile } from "@/features/faculty/components/faculty-profile";

export default async function FacultyProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <FacultyProfile facultyId={id} />
    </AuthGate>
  );
}
