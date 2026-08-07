// The two status pills this app actually shows, as components rather than as
// ten hand-written spans.
//
// Both previously hardcoded raw Tailwind colours (`bg-emerald-500/10
// text-emerald-600`, `bg-amber-500/10 text-amber-600`), which meant they
// ignored the theme entirely and would not have followed a brand change. They
// now go through Badge's `success` / `warning` variants, which are backed by
// the --success / --warning tokens — non-brand by design, because "this record
// is live" must stay green even if the brand becomes green.
"use client";

import { Badge } from "@/components/ui/badge";

/**
 * A catalogue record's on/off state — degrees, branches, departments, programs,
 * classes, subjects. Six byte-identical copies of this existed.
 */
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "success" : "muted"} size="code" dot>
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}

/**
 * A person's ACCOUNT state, which is a different question from whether their
 * record is active — hence three outcomes, not two:
 *
 *   Inactive — the person's record or their login is switched off. They cannot
 *     sign in. (Shows the specific lifecycle word when the record itself is the
 *     reason: "graduated", "transferred".)
 *   Invited  — active, but still on the temp password the admin generated. The
 *     account exists and nobody has used it yet, which is the state an admin
 *     chasing onboarding actually wants to see.
 *   Active   — signed in at least once and holding their own password.
 */
export function AccountBadge({
  recordActive,
  loginActive,
  mustChangePassword,
  inactiveLabel,
}: {
  recordActive: boolean;
  loginActive: boolean;
  mustChangePassword: boolean;
  /** Shown instead of "Inactive" when the record's own status is the reason. */
  inactiveLabel?: string;
}) {
  if (!recordActive || !loginActive) {
    return (
      <Badge variant="muted" size="code">
        {inactiveLabel ?? "Inactive"}
      </Badge>
    );
  }
  if (mustChangePassword) {
    return (
      <Badge variant="warning" size="code">
        Invited
      </Badge>
    );
  }
  return (
    <Badge variant="success" size="code">
      Active
    </Badge>
  );
}
