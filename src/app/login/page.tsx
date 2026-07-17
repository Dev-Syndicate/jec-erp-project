import { LoginForm } from "@/features/auth/components/login-form";

// The attendance grid is the page's signature: a faint ledger of period cells,
// a few marked "present", rendered entirely in brand + status tokens so it
// re-skins with --brand-hue. It's what this ERP actually runs — the college's
// day, one section at a time — so it stands in for the brand without a logo.
// Deterministic pattern (no randomness) keeps SSR and client markup identical.
const ROWS = 7;
const COLS = 6;
const MARKED = new Set([
  "0-1", "0-4", "1-2", "2-0", "2-5", "3-3", "4-1", "4-4", "5-2", "6-0", "6-5",
]);

function AttendanceGrid() {
  return (
    <div
      aria-hidden
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: ROWS * COLS }).map((_, i) => {
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        const marked = MARKED.has(`${r}-${c}`);
        return (
          <div
            key={i}
            className={`login-cell aspect-square rounded-[3px] ${
              marked
                ? "bg-primary-foreground/25 ring-1 ring-primary-foreground/40"
                : "bg-primary-foreground/6 ring-1 ring-primary-foreground/10"
            }`}
            style={{ animationDelay: `${150 + i * 22}ms` }}
          />
        );
      })}
    </div>
  );
}

function BrandPanel() {
  // The panel is a permanently-dark "cover" surface in BOTH themes: its
  // background and text are derived here from --brand-hue directly (deep teal
  // field, near-white ink) rather than from --primary/--primary-foreground,
  // which invert in dark mode and would flip the panel bright. This keeps the
  // panel legible and on-brand whichever theme the app is in, and still
  // re-skins when --brand-hue changes.
  const panelStyle = {
    "--panel-bg": "oklch(0.32 0.07 var(--brand-hue))",
    "--panel-bg-2": "oklch(0.42 0.10 var(--brand-hue))",
    "--panel-ink": "oklch(0.985 0.01 var(--brand-hue))",
    background:
      "linear-gradient(150deg, var(--panel-bg) 0%, var(--panel-bg) 55%, var(--panel-bg-2) 130%)",
    color: "var(--panel-ink)",
  } as React.CSSProperties;

  return (
    <aside
      style={panelStyle}
      className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16 [--primary-foreground:var(--panel-ink)]"
    >
      {/* Depth wash — brand-hue tint, no hardcoded color. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_100%_0%,color-mix(in_oklch,var(--panel-ink)_12%,transparent),transparent_55%)]" />

      <div className="relative flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-md bg-primary-foreground/15 font-heading text-sm font-semibold ring-1 ring-primary-foreground/25">
          JE
        </span>
        <div className="leading-tight">
          <p className="font-heading text-sm font-semibold">Jeppiaar Engineering College</p>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-primary-foreground/70">
            ERP · System of record
          </p>
        </div>
      </div>

      <div className="relative flex flex-col gap-8">
        <div className="max-w-sm">
          <AttendanceGrid />
        </div>
        <div className="max-w-md">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-primary-foreground/70">
            One place for the college day
          </p>
          <h2 className="mt-3 font-heading text-2xl font-semibold leading-snug xl:text-3xl">
            Attendance, timetables, leave and roles — for every department, every term.
          </h2>
        </div>
      </div>

      <div className="relative flex items-center gap-2 font-mono text-[0.7rem] text-primary-foreground/60">
        <span className="size-1.5 rounded-full bg-status-present" />
        Sessions are verified server-side. Your data never leaves the college.
      </div>
    </aside>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-full flex-1 lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.15fr_1fr]">
      <BrandPanel />

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="login-rise flex w-full max-w-sm flex-col gap-10">
          {/* Compact brand lockup for the narrow-screen form-only view. */}
          <div className="flex items-center gap-2.5 lg:hidden">
            <span className="grid size-8 place-items-center rounded-md bg-primary font-heading text-xs font-semibold text-primary-foreground">
              JE
            </span>
            <span className="font-heading text-sm font-semibold text-foreground">JEC ERP</span>
          </div>

          <LoginForm />
        </div>
      </section>
    </main>
  );
}
