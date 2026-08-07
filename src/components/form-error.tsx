// The inline error block forms and pages show when a mutation or query fails.
//
// Seventeen files declared this exact component privately and another 21 places
// inlined its markup, so the same paragraph appeared 38 times. The props here
// match those local versions exactly — `{ children }` — so adopting it is an
// import change with no call-site edits, and the rendered text is untouched.
//
// Children are wrapped in <AlertDescription> because Alert lays its content out
// on a grid whose second column holds the message; a bare text node has no
// class to place itself there. Callers keep passing plain strings.
"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";

export function FormError({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
