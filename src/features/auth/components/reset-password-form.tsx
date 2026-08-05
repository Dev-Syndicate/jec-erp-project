// The password-reset form, on OUR domain.
//
// Firebase can host this itself, and did: the emailed link landed on
// <project>.firebaseapp.com — an unbranded Google page, on a domain the
// recipient has never seen, reached from a password email. That is the shape of
// a phishing link, and it was one reason Gmail filed these as spam. Handling the
// oobCode here keeps the whole flow on one domain and looks like the product.
//
// THE CODE IS VERIFIED BEFORE THE FORM IS SHOWN. A reset code is single-use and
// expires, so checking on arrival means a stale link fails with an explanation
// rather than after someone has typed a new password twice. Verifying also
// returns the account's email, so the page can say whose password this is.
//
// Note this does NOT sign them in — Firebase leaves them signed out after a
// reset — so the success state sends them to /login.
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  errorMessage,
  Field,
  FormError,
  PasswordInput,
  StepHeading,
} from "@/features/auth/components/login-form";
import { useConfirmPasswordReset, useVerifyResetCode } from "@/features/auth/hooks/use-auth";

/** Firebase's error codes, turned into something a student can act on. */
function codeMessage(e: unknown): string {
  const code =
    e && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code : "";
  switch (code) {
    case "auth/expired-action-code":
      return "This reset link has expired. Request a new one from the sign-in page.";
    case "auth/invalid-action-code":
      // Also what you get for an already-used link, which is the common case:
      // people click the same email twice.
      return "This reset link is no longer valid — it may have already been used. Request a new one.";
    case "auth/user-disabled":
      return "This account has been deactivated. Contact the ERP administrator.";
    case "auth/user-not-found":
      return "That account no longer exists. Contact the ERP administrator.";
    case "auth/weak-password":
      return "Choose a longer password — at least 8 characters.";
    default:
      return errorMessage(e);
  }
}

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const oobCode = params.get("oobCode");
  // A CUSTOM ACTION URL routes every auth email here, not just this one:
  // verifyEmail, recoverEmail and the MFA notices all arrive with their own
  // `mode`. Only resetPassword is handled, so anything else must say so rather
  // than silently presenting a password form for the wrong operation.
  const mode = params.get("mode");
  const wrongMode = mode !== null && mode !== "resetPassword";

  const verify = useVerifyResetCode(oobCode);
  const confirm = useConfirmPasswordReset();

  const [password, setPassword] = useState("");
  const [confirmValue, setConfirmValue] = useState("");
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirmValue.length > 0 && password !== confirmValue;

  // --- an auth email we don't handle ---------------------------------------
  if (wrongMode) {
    return (
      <div className="flex w-full flex-col gap-7">
        <StepHeading
          step="Access"
          title="This link isn’t a password reset"
          hint="It looks like a different kind of account email. Sign in, or ask the ERP administrator."
        />
        <Button size="lg" className="h-11" render={<Link href="/login" />}>
          Back to sign in
        </Button>
      </div>
    );
  }

  // --- no code in the URL --------------------------------------------------
  if (!oobCode) {
    return (
      <div className="flex w-full flex-col gap-7">
        <StepHeading
          step="Access · Reset password"
          title="Nothing to reset"
          hint="Open the link from your reset email, or request a new one."
        />
        <Button size="lg" className="h-11" render={<Link href="/login" />}>
          Back to sign in
        </Button>
      </div>
    );
  }

  // --- checking the link ---------------------------------------------------
  if (verify.isPending) {
    return (
      <div className="flex w-full flex-col gap-7">
        <StepHeading
          step="Access · Reset password"
          title="Checking your link…"
          hint="One moment."
        />
      </div>
    );
  }

  // --- the link is stale, used, or malformed -------------------------------
  if (verify.isError) {
    return (
      <div className="flex w-full flex-col gap-7">
        <StepHeading
          step="Access · Reset password"
          title="This link can’t be used"
          hint="Reset links work once, and expire after a while."
        />
        <FormError>{codeMessage(verify.error)}</FormError>
        <Button size="lg" className="h-11" render={<Link href="/login" />}>
          Request a new link
        </Button>
      </div>
    );
  }

  // --- done ----------------------------------------------------------------
  if (done) {
    return (
      <div className="flex w-full flex-col gap-7">
        <StepHeading
          step="Access · Reset password"
          title="Password updated"
          hint={`Sign in with your new password${verify.data ? ` as ${verify.data}` : ""}.`}
        />
        <Button size="lg" className="h-11" onClick={() => router.push("/login")}>
          Go to sign in
        </Button>
      </div>
    );
  }

  // --- the form ------------------------------------------------------------
  return (
    <div className="flex w-full flex-col gap-7">
      <StepHeading
        step="Access · Reset password"
        title="Choose a new password"
        // Naming the account is the reassurance Firebase's own page gave, and
        // catches the case where someone opens a link meant for a colleague.
        hint={verify.data ? `For ${verify.data}.` : "Set a new password for your account."}
      />
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (mismatch || password.length < 8) return;
          confirm.mutate({ oobCode, newPassword: password }, { onSuccess: () => setDone(true) });
        }}
      >
        <Field
          label="New password"
          htmlFor="reset-password"
          trailing={
            <span className="font-mono text-[0.7rem] text-muted-foreground">8+ characters</span>
          }
        >
          <PasswordInput
            id="reset-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
          />
        </Field>
        <Field label="Confirm password" htmlFor="reset-confirm">
          <PasswordInput
            id="reset-confirm"
            value={confirmValue}
            onChange={setConfirmValue}
            autoComplete="new-password"
          />
        </Field>
        {tooShort && <FormError>Use at least 8 characters.</FormError>}
        {mismatch && <FormError>Those passwords don’t match.</FormError>}
        {confirm.isError && <FormError>{codeMessage(confirm.error)}</FormError>}
        <Button
          type="submit"
          size="lg"
          disabled={confirm.isPending || mismatch || tooShort || password.length === 0}
          className="mt-1 h-11"
        >
          {confirm.isPending ? "Saving…" : "Save password"}
        </Button>
        <Button type="button" variant="ghost" render={<Link href="/login" />}>
          Back to sign in
        </Button>
      </form>
    </div>
  );
}
