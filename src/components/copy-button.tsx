// "Copy" with a 1.5s confirmation. Four screens had their own `copied` state
// and their own `setTimeout`, all identical.
//
// Three details the copies got right and that are easy to lose in a rewrite:
//
//  · The flag flips inside the promise's SUCCESS handler, not before it. The
//    Clipboard API can reject — a page that isn't focused, or a browser
//    withholding permission — and saying "Copied" when nothing was copied is
//    worse than saying nothing, because the user walks away with an empty
//    buffer and a temp password they now have to regenerate.
//  · The timer is cleared on unmount. These live in dialogs that close as soon
//    as the password is delivered, and a pending setState on an unmounted
//    component is exactly the kind of warning nobody chases down later.
//  · `navigator.clipboard?.` stays optional-chained: it is undefined outside a
//    secure context, and a bare access throws.
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  variant = "outline",
  size = "sm",
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function copy() {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      data-icon="inline-start"
      onClick={copy}
      className={className}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
