// /reset — the password-reset form, on our own domain.
//
// Firebase's emailed link points here (see useSendPasswordReset) carrying an
// `oobCode`. Previously it pointed at <project>.firebaseapp.com, Google's own
// hosted page: functional, but unbranded and on a domain the recipient has
// never seen — inside a password email, which is exactly what a phishing link
// looks like.
//
// Deliberately reuses the login page's shell so the two read as one flow.
// Suspense is required: the form calls useSearchParams to read the code, which
// opts the route into client rendering.
import { Suspense } from "react";

import { AuthLayout } from "@/features/auth/components/auth-layout";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
