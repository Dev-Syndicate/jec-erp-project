// Shown once after a successful provision (staff or student). The temp password
// is sensitive and won't be retrievable again — the admin relays it, then
// dismisses. Email delivery replaces this hand-off in a later phase.
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ProvisionedUser } from "@/features/roles/types";

export function ProvisionResult({
  user,
  onDismiss,
}: {
  user: ProvisionedUser;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-accent/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-primary">
            Account created
          </p>
          <p className="mt-1 text-sm text-foreground">
            {user.displayName} · {user.role}
            {user.registerNumber ? ` · ${user.registerNumber}` : ""} · {user.email}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          Temporary password — shown once
        </span>
        <div className="flex items-center justify-between gap-3">
          <code className="text-sm text-foreground">{user.tempPassword}</code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(user.tempPassword).then(
                () => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                },
                () => setCopied(false),
              );
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Relay this to {user.displayName.split(" ")[0]} securely. They’ll set a new password on first
        login. Email delivery replaces this step in a later phase.
      </p>
    </div>
  );
}
