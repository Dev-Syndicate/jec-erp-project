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

// The grid framed as the thing it depicts: one section's attendance card for
// one period, mid-day — tilted like a card set down on a desk, lit from behind.
// It plays the role the reference art does, but with the ERP's own subject.
function DayCard() {
  return (
    <div className="relative mx-auto w-fit">
      {/* Back-glow — brand-derived, sits behind the card. */}
      <div
        aria-hidden
        className="absolute -inset-10 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--panel-glow), transparent 70%)" }}
      />

      {/* Floating accents — the "present" green is a status token, never brand. */}
      <span
        aria-hidden
        className="absolute -right-5 -top-4 size-3 rotate-12 rounded-[4px] bg-status-present/90"
      />
      <span
        aria-hidden
        className="absolute -bottom-5 -left-7 size-9 rounded-full border-[5px]"
        style={{ borderColor: "var(--panel-glow)" }}
      />

      <div className="relative w-60 -rotate-2 rounded-2xl bg-primary-foreground/10 p-4 ring-1 ring-primary-foreground/20 xl:w-64">
        <div className="mb-3 flex items-center justify-between font-mono text-[0.65rem] uppercase tracking-[0.14em] text-primary-foreground/70">
          <span>CSE · II-A · P3</span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-status-present" />
            Present
          </span>
        </div>
        <AttendanceGrid />
      </div>
    </div>
  );
}

function FeaturePanel() {
  // A permanently-dark "cover" card in BOTH themes: background and ink are
  // derived here from --brand-hue directly (near-black teal field, near-white
  // ink) rather than from --primary/--primary-foreground, which invert in dark
  // mode and would flip the panel bright. Re-skins when --brand-hue changes.
  const panelStyle = {
    "--panel-bg": "oklch(0.21 0.045 var(--brand-hue))",
    "--panel-bg-2": "oklch(0.31 0.085 var(--brand-hue))",
    "--panel-ink": "oklch(0.985 0.01 var(--brand-hue))",
    "--panel-glow": "oklch(0.62 0.12 var(--brand-hue))",
    background:
      "linear-gradient(160deg, var(--panel-bg) 0%, var(--panel-bg) 60%, var(--panel-bg-2) 135%)",
    color: "var(--panel-ink)",
  } as React.CSSProperties;

  // Diamond lattice, faded in from the top-right corner — texture, not content.
  const latticeStyle = {
    backgroundImage:
      "repeating-linear-gradient(45deg, color-mix(in oklch, var(--panel-ink) 7%, transparent) 0 1px, transparent 1px 22px)," +
      "repeating-linear-gradient(-45deg, color-mix(in oklch, var(--panel-ink) 7%, transparent) 0 1px, transparent 1px 22px)",
    WebkitMaskImage: "radial-gradient(110% 90% at 100% 0%, black, transparent 62%)",
    maskImage: "radial-gradient(110% 90% at 100% 0%, black, transparent 62%)",
  } as React.CSSProperties;

  return (
    <aside className="hidden p-4 lg:flex">
      <div
        style={panelStyle}
        className="relative flex flex-1 flex-col overflow-hidden rounded-[1.75rem] p-10 xl:p-12 [--primary-foreground:var(--panel-ink)]"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0" style={latticeStyle} />

        <div className="relative my-auto py-10">
          <DayCard />
        </div>

        <div className="relative flex flex-col gap-6">
          <div className="max-w-md">
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-primary-foreground/70">
              One place for the college day
            </p>
            <h2 className="mt-3 font-heading text-2xl font-semibold leading-snug xl:text-3xl">
              Attendance, timetables and marks — every program, every semester.
            </h2>
          </div>
          <div className="flex items-center gap-2 font-mono text-[0.7rem] text-primary-foreground/60">
            <span className="size-1.5 rounded-full bg-status-present" />
            Sessions are verified server-side. Your data never leaves the college.
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function LoginPage() {
  // Soft brand wash in the form column's top corner — the light side's only
  // decoration, derived from --primary so it follows the hue in both themes.
  const washStyle = {
    background:
      "radial-gradient(85% 65% at 0% 0%, color-mix(in oklch, var(--primary) 9%, transparent), transparent 62%)",
  } as React.CSSProperties;

  return (
    <main className="relative grid min-h-full flex-1 bg-background lg:grid-cols-[1fr_1.08fr]">
      <section className="relative flex flex-col px-6 py-8 sm:px-10 lg:px-14">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={washStyle} />

        <header className="relative flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary font-heading text-xs font-semibold text-primary-foreground">
            JE
          </span>
          <div className="leading-tight">
            <p className="font-heading text-sm font-semibold text-foreground">
              Jeppiaar Engineering College
            </p>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
              ERP · System of record
            </p>
          </div>
        </header>

        <div className="relative flex flex-1 items-center justify-center py-12">
          <div className="login-rise w-full max-w-sm">
            <LoginForm />
          </div>
        </div>
      </section>

      <FeaturePanel />
    </main>
  );
}
