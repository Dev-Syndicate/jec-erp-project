// Login + forced first-login password reset. Client-side: signs in with
// Firebase, then reads /api/auth/me. If mustChangePassword is set, it blocks on
// a reset step before the user can proceed (uniform onboarding, CLAUDE.md).
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useChangePassword,
  useFirebaseUser,
  useMe,
  useSignIn,
  useSignOut,
} from "@/features/auth/hooks/use-auth";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}

// Heading for each state. The mono eyebrow is OPTIONAL and only used where it
// encodes real flow state (the forced first-login reset) — a one-step sign-in
// numbered "step 1 of 1" would be decoration, not information.
function StepHeading({ step, title, hint }: { step?: string; title: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {step && (
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-primary">
          {step}
        </span>
      )}
      <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight text-foreground">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

// A field row: label + control, consistent spacing across all states.
function Field({
  label,
  htmlFor,
  children,
  trailing,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {trailing}
      </div>
      {children}
    </div>
  );
}

// Inline password field with a show/hide toggle — the reset step in particular
// benefits from letting people confirm what they typed.
function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  minLength?: number;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        placeholder={placeholder}
        className="h-10 pr-16"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      {children}
    </p>
  );
}

export function LoginForm() {
  const { firebaseUser, loading } = useFirebaseUser();
  const signedIn = !!firebaseUser;
  const me = useMe(signedIn);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        Verifying session…
      </div>
    );
  }

  // Signed in but a first-login reset is still pending — force it before access.
  if (signedIn && me.data?.mustChangePassword) {
    return <ChangePasswordStep />;
  }

  // Signed in, provisioned, and reset done — leave the login page for the app.
  if (signedIn && me.data) {
    return <RedirectToDashboard name={me.data.displayName} />;
  }

  return <SignInStep />;
}

// Brief transition shown while we navigate away from /login after a successful
// sign-in. The actual dashboard is protected by AuthGate independently.
function RedirectToDashboard({ name }: { name: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="size-1.5 animate-pulse rounded-full bg-primary" />
      Signed in as {name.split(" ")[0]} — opening your dashboard…
    </div>
  );
}

type SignInMode = "staff" | "student";

// Who's signing in, as two selectable tiles — each names the credential it
// expects, so the choice teaches the form. Radio semantics, arrow-key friendly.
function IdentityTiles({
  mode,
  onChange,
}: {
  mode: SignInMode;
  onChange: (m: SignInMode) => void;
}) {
  const options: Array<{ id: SignInMode; label: string; credential: string }> = [
    { id: "staff", label: "Staff", credential: "College email" },
    { id: "student", label: "Student", credential: "Register number" },
  ];
  return (
    <div role="radiogroup" aria-label="Sign in as" className="grid grid-cols-2 gap-3">
      {options.map((o) => {
        const active = mode === o.id;
        return (
          <button
            key={o.id}
            role="radio"
            type="button"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`flex flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
              active
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/40"
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={`size-2 rounded-full transition-colors ${
                  active ? "bg-primary" : "bg-border"
                }`}
              />
              <span
                className={`text-sm font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}
              >
                {o.label}
              </span>
            </span>
            <span className="pl-4 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
              {o.credential}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Staff sign in with their email; students with their register number. The
// identity choice is two radio tiles that each NAME the credential they expect;
// the fields below are open underlined lines — no card chrome.
function SignInStep() {
  const signIn = useSignIn();
  const [mode, setMode] = useState<SignInMode>("staff");
  const [email, setEmail] = useState("");
  const [registerNumber, setRegisterNumber] = useState("");
  const [password, setPassword] = useState("");

  const isStudent = mode === "student";

  return (
    <div className="flex w-full flex-col gap-7">
      <StepHeading
        title="Welcome back."
        hint="Choose who you are — the form asks for the right credential."
      />
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          signIn.mutate(
            isStudent
              ? { kind: "register", registerNumber, password }
              : { kind: "email", email, password },
          );
        }}
      >
        <IdentityTiles
          mode={mode}
          onChange={(m) => {
            setMode(m);
            signIn.reset();
          }}
        />

        {isStudent ? (
          <Field label="Register number" htmlFor="register">
            <Input
              id="register"
              type="text"
              inputMode="text"
              autoComplete="username"
              autoCapitalize="characters"
              value={registerNumber}
              onChange={(e) => setRegisterNumber(e.target.value)}
              required
              placeholder="422021104042"
              className="h-10"
            />
          </Field>
        ) : (
          <Field label="College email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="name@jeppiaar.edu.in"
              className="h-10"
            />
          </Field>
        )}

        <Field label="Password" htmlFor="password">
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </Field>

        {signIn.isError && <FormError>{errorMessage(signIn.error)}</FormError>}
        <Button type="submit" size="lg" disabled={signIn.isPending} className="h-11">
          {signIn.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        New here? Your admin creates your account and emails a temporary password — you&apos;ll
        set your own the first time you sign in.
      </p>
    </div>
  );
}

function ChangePasswordStep() {
  const changePassword = useChangePassword();
  const signOut = useSignOut();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <div className="flex w-full flex-col gap-7">
      <StepHeading
        step="Onboarding · First sign-in"
        title="Set your password"
        hint="Your account opened with a temporary password. Choose your own to continue."
      />
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (mismatch || password.length < 8) return;
          changePassword.mutate(password);
        }}
      >
        <Field
          label="New password"
          htmlFor="new-password"
          trailing={
            <span className="font-mono text-[0.7rem] text-muted-foreground">
              8+ characters
            </span>
          }
        >
          <PasswordInput
            id="new-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirm-password">
          <PasswordInput
            id="confirm-password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
        </Field>
        {tooShort && <FormError>Use at least 8 characters.</FormError>}
        {mismatch && <FormError>Those passwords don’t match.</FormError>}
        {changePassword.isError && <FormError>{errorMessage(changePassword.error)}</FormError>}
        <Button
          type="submit"
          size="lg"
          disabled={changePassword.isPending || mismatch || tooShort}
          className="mt-1 h-11"
        >
          {changePassword.isPending ? "Saving…" : "Save & continue"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => signOut.mutate()}>
          Cancel and sign out
        </Button>
      </form>
    </div>
  );
}

