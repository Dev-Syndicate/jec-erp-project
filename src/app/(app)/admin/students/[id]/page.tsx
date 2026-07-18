// /admin/students/[id] — a student's admission wizard. Super Admin / HOD.
// Auth + shell from the (app) layout; the API re-checks dept scope on every save.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AdmissionWizard } from "@/features/students/components/admission-wizard";

export default async function StudentAdmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGate requireRole={["Super Admin", "HOD"]}>
      <AdmissionWizard studentId={id} />
    </AuthGate>
  );
}
