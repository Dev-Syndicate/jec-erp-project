// /profile — the signed-in user's own account details. Any authenticated user
// may view their own profile, so there's no role gate beyond AuthGate. Thin
// page: it mounts the feature view.
import { AuthGate } from "@/features/auth/components/auth-gate";
import { ProfileView } from "@/features/profile/components/profile-view";

export default function ProfilePage() {
  return (
    <AuthGate>
      <ProfileView />
    </AuthGate>
  );
}
