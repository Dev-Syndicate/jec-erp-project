// Regenerate one staff member's temporary password. Shown in the faculty
// profile header. On success it reveals the new temp password once (via the
// shared banner) — the admin relays it. The API refuses if the member already
// set their own password (would lock them out); that message surfaces here.
"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRegenerateFacultyPassword } from "@/features/faculty/hooks/use-faculty";

export function RegeneratePasswordButton({
  facultyId,
  onGenerated,
}: {
  facultyId: string;
  // Bubbles the new password up so the profile can show it in the banner.
  onGenerated: (tempPassword: string) => void;
}) {
  const regen = useRegenerateFacultyPassword(facultyId);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={regen.isPending}
        onClick={() => {
          setError(null);
          regen.mutate(undefined, {
            onSuccess: (r) => onGenerated(r.tempPassword),
            onError: (e) => setError(e instanceof Error ? e.message : "Couldn’t regenerate."),
          });
        }}
      >
        <KeyRound className="size-4" />
        {regen.isPending ? "Generating…" : "Regenerate password"}
      </Button>
      {error && <p role="alert" className="max-w-xs text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
