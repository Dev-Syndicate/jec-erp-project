// /faculty/attachments — Super-Admin-only cross-department teaching attachments.
// The (app) layout gives auth + shell; here we add the role gate (AuthGate
// requireRole is UX — the API re-checks every request). Page stays thin: it just
// mounts the feature manager.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AttachmentManager } from "@/features/faculty/components/attachment-manager";

export default function FacultyAttachmentsPage() {
  return (
    <AuthGate requireRole={["Super Admin"]}>
      <AttachmentManager />
    </AuthGate>
  );
}
