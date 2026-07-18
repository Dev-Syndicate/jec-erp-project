// One-time temp-password banner, shown at the top of the admission wizard right
// after a student is created (the Add-student flow redirects here with the
// password in the URL). It's sensitive and not retrievable again, so the admin
// copies/relays it, then dismisses — which also strips it from the URL so a
// refresh or shared link won't leak it.
"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { KeyRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function TempPasswordBanner({
  name,
  registerNumber,
  email,
  tempPassword,
  headline = "Account created — continue the admission below",
}: {
  name: string;
  registerNumber: string;
  email: string;
  tempPassword: string;
  headline?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    // Drop the query param so a refresh/back doesn't re-reveal the password.
    router.replace(pathname);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-accent/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
            <KeyRound className="size-4" />
          </span>
          <div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-primary">
              {headline}
            </p>
            <p className="mt-1 text-sm text-foreground">
              {name} · {registerNumber} · {email}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={dismiss}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          Temporary password — shown once
        </span>
        <div className="flex items-center justify-between gap-3">
          <code className="text-sm text-foreground">{tempPassword}</code>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigator.clipboard?.writeText(tempPassword).then(
                () => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                },
                () => setCopied(false),
              )
            }
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Relay this to {name.split(" ")[0]} securely — they’ll set a new password on first login.
        It won’t be shown again once dismissed.
      </p>
    </div>
  );
}
