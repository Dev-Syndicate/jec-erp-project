// Shared page header for the app's inner pages — a mono eyebrow (system voice),
// a heading, and a one-line description. Keeps titles consistent across the
// Departments / Faculty / Students pages.
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
    <header className="flex flex-col gap-1.5">
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-primary">
        {eyebrow}
      </span>
      <h1 className="font-heading text-2xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </header>
  );
}
