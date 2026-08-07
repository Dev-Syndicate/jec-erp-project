// /login — sign in, or start a password reset.
//
// The shell (form column + brand mosaic panel) lives in AuthLayout, shared with
// /reset so the two pages read as one flow rather than drifting apart.
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  );
}
