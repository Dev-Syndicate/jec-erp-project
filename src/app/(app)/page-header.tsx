// Shared page header for the app's inner pages — a mono eyebrow (system voice),
// a heading, and a one-line description. Keeps titles consistent across the
// Departments / Faculty / Students pages.
//
// 22 of the 24 screens render this, which is why it is worth restyling here
// rather than per page: one edit moves the whole app at once. The props are
// unchanged, so no caller needs touching.
//
// The eyebrow now uses the `eyebrow` utility (globals.css) instead of spelling
// out `font-mono text-[0.7rem] uppercase tracking-[0.18em]`, and `text-balance`
// on the description stops a two-line summary breaking with one orphaned word.
export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="flex min-w-0 flex-col gap-1.5">
      <span className="eyebrow text-primary">{eyebrow}</span>
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="max-w-2xl text-pretty text-sm text-muted-foreground">{description}</p>
    </header>
  );
}
