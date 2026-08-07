// The shared shell for the unauthenticated pages (/login, /reset): the form
// column at 40%, and a dark "cover" panel at 60% joined to it by a flowing
// curve rather than a straight edge.
//
// Extracted from the login page when /reset was added — the two are one flow
// and must not drift apart, and a second copy of the panel would be the kind of
// duplication that goes stale silently.
//
// The panel is a BENTO MOSAIC of what this ERP actually runs — the day register
// and the period grid. Every tile is drawn with brand tokens rather than
// imagery, so the panel re-skins with --brand-hue and ships no photography the
// college doesn't own.
// The one note not derived from --brand-hue is the accent, which carries the
// palette's Secondary Orange against the gold field.
//
// Nothing here is a real figure. The tiles show the SHAPE of each module — a
// register with cells marked, eight periods with one running — never a count,
// a percentage or a name. /login is public and unauthenticated, so a live
// number would be a disclosure; an invented one would be worse.
import Image from "next/image";

// The crest is a wide horizontal lockup (~4.1:1) in gold. It sits on the light
// form column and never on the dark panel: its gold has too little contrast
// against the panel's dark field to stay legible, and the lockup carries its
// own white plate.
const LOGO = { src: "/JEC_logo.png", width: 4324, height: 1055 };

// ─── The curve ─────────────────────────────────────────────────────────────
//
// The panel's left edge, in objectBoundingBox units (0–1 on both axes), so one
// path serves both the clip and the highlight stroke and the two can never
// drift out of register.
//
// A single smooth S: it enters at 22% across the top, swells left to 5% at the
// waist, and settles back to 14% at the foot. Because objectBoundingBox
// normalises each axis independently the curve restretches with the viewport
// instead of keeping a fixed radius — which is what makes it read as a flowing
// edge at every window size rather than a circle segment that goes wrong off
// its design width.
//
// 22% is the binding number: it is the curve's furthest incursion, so panel
// content is inset past it (see PANEL_INSET) and never lands under the clip.
const CURVE_EDGE = "M0.22,0 C0.10,0.16 0.05,0.32 0.05,0.52 C0.05,0.72 0.17,0.84 0.14,1";
const CURVE_FILL = `${CURVE_EDGE} L1,1 L1,0 Z`;

// How far the curved field bleeds LEFT of its column, as a share of the column.
// The binding constraint is the narrowest layout that shows the panel: at the
// `lg` breakpoint the form column is ~410px and its content runs to ~362px,
// while the curve's deepest point sits at (BLEED - 0.05 × (1 + BLEED)) of the
// column. At 10% that lands ~20px clear of the form; at the 22% this started on
// it landed *behind* the email field. Widen the curve by reshaping the path,
// not by raising this.
const BLEED = "10%";
const FIELD_SPAN = "110%"; // column + BLEED — the clipped layer's own width

// Clears the curve's furthest incursion (its 0.22 entry at the top, which lands
// at ~14% across the column). Percentage, not rem, so it tracks the curve —
// which is a percentage of the same box.
const PANEL_INSET = "16%";

/**
 * The clip path and the gradient for its lit edge.
 *
 * Rendered INSIDE the panel, not at the page root: the gradient stops read
 * --panel-accent / --panel-ink, which are declared on the panel element, and a
 * var() resolves against the element it is used on. Hoisted out to the shell
 * these would resolve to nothing and the stroke would vanish. Both are found by
 * id, which is document-global, so nesting costs nothing.
 *
 * Stop colours go through `style` rather than the `stopColor` attribute —
 * presentation attributes are not parsed as full CSS values and drop var().
 */
function CurveDefs() {
  return (
    <svg aria-hidden className="absolute size-0" focusable="false">
      <defs>
        <clipPath id="auth-curve" clipPathUnits="objectBoundingBox">
          <path d={CURVE_FILL} />
        </clipPath>
        <linearGradient id="auth-curve-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--panel-accent)", stopOpacity: 0.55 }} />
          <stop offset="45%" style={{ stopColor: "var(--panel-ink)", stopOpacity: 0.35 }} />
          <stop offset="100%" style={{ stopColor: "var(--panel-accent)", stopOpacity: 0.25 }} />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Panel tiles ───────────────────────────────────────────────────────────

/**
 * Glass tile. `delay` staggers the reveal so the mosaic assembles rather than
 * appearing at once. `accent` is the focal treatment — a gold rim instead of
 * the default ink one — and is a flag rather than a className override so the
 * two variants can't drift into needing `!important` to beat each other.
 */
function Tile({
  className = "",
  delay,
  accent = false,
  children,
}: {
  className?: string;
  delay: number;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`auth-tile relative min-h-0 overflow-hidden rounded-2xl p-4 ring-1 ring-inset backdrop-blur-sm ${
        accent
          ? "bg-primary-foreground/10 ring-[color-mix(in_oklch,var(--panel-accent)_28%,transparent)]"
          : "bg-primary-foreground/6 ring-primary-foreground/12"
      } ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** The small mono caption every tile carries, so the mosaic reads as a legend. */
function TileLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-primary-foreground/55">
      {children}
    </p>
  );
}

// The day register: a faint ledger of period cells, a few marked present. This
// is the page's signature — it's the artefact the whole system exists to
// produce. The marked set is a fixed constant, not random, so the server and
// client render identical markup.
const ROWS = 7;
const COLS = 6;
const MARKED = new Set([
  "0-1", "0-4", "1-2", "2-0", "2-5", "3-3", "4-1", "4-4", "5-2", "6-0", "6-5",
]);

function RegisterTile() {
  return (
    <Tile delay={220} className="col-start-3 row-start-1 col-span-2 row-span-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <TileLabel>Day register</TileLabel>
        <span className="flex items-center gap-1.5 font-mono text-[0.65rem] text-primary-foreground/45">
          <span className="auth-pulse size-1.5 rounded-full bg-status-present text-status-present" />
          Live
        </span>
      </div>
      <div
        aria-hidden
        className="grid min-h-0 flex-1 content-center gap-1.5"
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: ROWS * COLS }).map((_, i) => {
          const marked = MARKED.has(`${Math.floor(i / COLS)}-${i % COLS}`);
          return (
            <div
              key={i}
              className={`login-cell aspect-square rounded-[4px] ${
                marked
                  ? "bg-primary-foreground/28 ring-1 ring-primary-foreground/40"
                  : "bg-primary-foreground/6 ring-1 ring-primary-foreground/10"
              }`}
              style={{ animationDelay: `${420 + i * 18}ms` }}
            />
          );
        })}
      </div>
    </Tile>
  );
}

// Eight periods, one running. Mon–Fri only (a working Saturday borrows a
// weekday's grid), which is why the strip is a day rather than a week.
function TimetableTile() {
  const RUNNING = 4;
  return (
    <Tile delay={300} className="col-start-1 row-start-3 col-span-2 flex flex-col justify-between gap-3">
      <TileLabel>Timetable · today</TileLabel>
      <div aria-hidden className="flex items-end gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 rounded-[3px] ${
              i === RUNNING
                ? "h-7 bg-primary-foreground/70"
                : i < RUNNING
                  ? "h-4 bg-primary-foreground/25"
                  : "h-4 bg-primary-foreground/10"
            }`}
          />
        ))}
      </div>
    </Tile>
  );
}

// The hero tile — the one that carries the message. Gold-edged so it reads as
// the focal point and ties back to the crest.
function HeroTile() {
  return (
    <Tile
      delay={140}
      accent
      className="col-start-1 row-start-1 col-span-2 row-span-2 flex flex-col justify-between gap-3"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--panel-accent)_16%,transparent),transparent_62%)]"
      />
      <TileLabel>The college day</TileLabel>
      <h2 className="relative font-heading text-2xl font-semibold leading-[1.15] tracking-tight xl:text-[1.75rem]">
        One place for
        <br />
        every period,
        <br />
        <span className="text-[var(--panel-accent)]">every term.</span>
      </h2>
    </Tile>
  );
}

// ─── The panel ─────────────────────────────────────────────────────────────

// A scrolling ribbon of the departments the system covers — the ticker idea,
// giving the panel a line of motion that isn't a tile. Rendered twice so the
// -50% loop is seamless.
const DEPARTMENTS = ["CSE", "IT", "ECE", "EEE", "MECH", "CIVIL", "S&H", "MBA"];

function Ticker() {
  // Spacing rides on each item (pr-6) rather than on the track (gap-6). With a
  // container gap the strip is 16 items and 15 gaps, so -50% lands half a gap
  // short of one full run and the loop visibly jumps; per-item padding makes the
  // sequence exactly periodic, so half the width IS one run.
  const run = (
    <>
      {DEPARTMENTS.map((d) => (
        <span key={d} className="flex shrink-0 items-center gap-6 pr-6">
          <span className="font-heading text-sm font-medium tracking-wide">{d}</span>
          <span className="text-[color-mix(in_oklch,var(--panel-accent)_60%,transparent)]">✦</span>
        </span>
      ))}
    </>
  );
  return (
    // Masked rather than overlaid with two background-coloured gradients: the
    // aurora drifts behind this strip, so a gradient painted in --panel-bg would
    // show as a pale rectangle wherever a blob passes under it. A mask fades the
    // content itself and is indifferent to what's behind.
    <div
      aria-hidden
      className="shrink-0 overflow-hidden py-1 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
    >
      <div className="auth-ticker flex w-max items-center text-primary-foreground/35">
        {run}
        {run}
      </div>
    </div>
  );
}

function BrandPanel() {
  // The panel is a permanently-dark "cover" surface in BOTH themes: its
  // background and ink are derived here from --brand-hue directly rather than
  // from --primary/--primary-foreground, which invert in dark mode and would
  // flip the panel bright. This keeps it legible and on-brand whichever theme
  // the app is in, and still re-skins when --brand-hue changes.
  //
  // --panel-accent is the palette's Secondary Orange, and the one colour here
  // NOT derived from --brand-hue. It was a hardcoded gold, which existed to
  // answer the college crest against a teal field — now that the brand itself
  // IS gold, gold-on-gold would leave the accent nothing to separate against,
  // so it moves to the secondary and the panel reads gold field / orange
  // highlight. It no longer needs hardcoding either: it comes from the palette.
  // The field's CHROMA is low on purpose. These lightnesses were tuned against a
  // teal brand, and a cool hue stays rich when you darken it; a warm one does
  // not — at 0.05 chroma the gold hue rendered as a muddy brown panel, and the
  // gold and orange accents on top had nothing to separate against. Dropping to
  // 0.02 makes the field a warm charcoal instead, which is the classic ground
  // for a gold palette and lets the two brand colours do the work. Still derived
  // from --brand-hue, so it re-skins.
  const panelStyle = {
    "--panel-bg": "oklch(0.21 0.02 var(--brand-hue))",
    "--panel-bg-2": "oklch(0.34 0.045 var(--brand-hue))",
    "--panel-ink": "oklch(0.985 0.01 var(--brand-hue))",
    "--panel-accent": "var(--brand-orange)",
    color: "var(--panel-ink)",
  } as React.CSSProperties;

  return (
    // The panel column is transparent; the dark FIELD is a clipped layer inside
    // it that bleeds left, past the column edge, into the form side. Clipping a
    // background layer rather than the panel itself keeps the tiles out of the
    // clip entirely — content is laid out normally and simply inset past the
    // curve, so nothing can be silently cut off by a path change.
    // NOT overflow-hidden. The curved field is deliberately positioned past this
    // column's left edge (BLEED) so the curve can swell into the form side —
    // clipping the panel to its own box shears that bleed off flat and leaves a
    // hard vertical seam down the middle of the page, which is precisely the
    // straight edge the curve exists to replace. Nothing needs containing here:
    // the aurora is inside the clip path, and each tile clips itself.
    <aside
      style={panelStyle}
      className="relative hidden min-h-0 lg:flex lg:flex-col [--primary-foreground:var(--panel-ink)]"
    >
      <CurveDefs />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 [clip-path:url(#auth-curve)]"
        style={{ left: `-${BLEED}`, background: "var(--panel-bg)" }}
      >
        {/* Aurora — two drifting brand washes and a gold ember, behind the
            tiles. Blurred and low-opacity, so it reads as depth rather than as
            shapes competing with the mosaic. Inside the clip, so the glow
            follows the curve instead of spilling onto the form side. */}
        <div className="auth-drift absolute left-[2%] top-[-15%] size-[34rem] rounded-full bg-[var(--panel-bg-2)] opacity-55 blur-[90px]" />
        <div
          className="auth-drift absolute -right-1/4 bottom-[-20%] size-[38rem] rounded-full bg-[var(--panel-bg-2)] opacity-40 blur-[100px]"
          style={{ animationDelay: "-7s", animationDirection: "reverse" }}
        />
        <div
          className="auth-drift absolute right-[12%] top-[35%] size-64 rounded-full bg-[var(--panel-accent)] opacity-[0.07] blur-[80px]"
          style={{ animationDelay: "-13s" }}
        />
      </div>

      {/* The lit edge along the curve. preserveAspectRatio="none" stretches the
          path to match the clip exactly; non-scaling-stroke keeps the line an
          even hairline despite that stretch. */}
      <svg
        aria-hidden
        focusable="false"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-y-0 right-0"
        style={{ left: `-${BLEED}`, width: FIELD_SPAN }}
      >
        <path
          d={CURVE_EDGE}
          fill="none"
          stroke="url(#auth-curve-edge)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div
        className="relative flex min-h-0 flex-1 flex-col gap-6 py-10 pr-10 xl:gap-8 xl:py-14 xl:pr-14"
        style={{ paddingLeft: PANEL_INSET }}
      >
        <header className="flex shrink-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-foreground/12 font-heading text-sm font-semibold ring-1 ring-inset ring-primary-foreground/25">
            JE
          </span>
          <div className="leading-tight">
            <p className="font-heading text-sm font-semibold">Jeppiaar Engineering College</p>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-primary-foreground/60">
              ERP · System of record
            </p>
          </div>
        </header>

        {/* Three rows, and the three tiles tile it exactly: hero 2×2 + register
            2×3 + timetable 2×1 = 12 of 12 cells. Adding or removing a tile means
            re-checking that sum, or the leftover shows as a hole. */}
        <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-3 gap-3 xl:gap-4">
          <HeroTile />
          <RegisterTile />
          <TimetableTile />
        </div>

        <footer className="flex shrink-0 flex-col gap-4">
          <Ticker />
          <p className="flex items-center gap-2 font-mono text-[0.7rem] text-primary-foreground/55">
            <span className="size-1.5 rounded-full bg-status-present" />
            Sessions are verified server-side. Your data never leaves the college.
          </p>
        </footer>
      </div>
    </aside>
  );
}

// ─── The shell ─────────────────────────────────────────────────────────────

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // 40 / 60 — the form takes the smaller share because it is six controls, and
    // the panel earns the larger one by carrying the whole brand.
    //
    // Height is pinned to the viewport from `lg` up so the panel is a fixed
    // composition that never scrolls its curve out of frame; the form column
    // scrolls independently if a short window can't fit it. Below `lg` the panel
    // is gone and the page flows normally.
    //
    // `lg:min-h-0` is load-bearing, not tidying. This is a flex child of <body>,
    // and a flex item's default `min-height: auto` refuses to shrink below its
    // content — so `h-dvh` was being ignored, the panel grew past the viewport,
    // and the ticker and footer were cut off at the bottom of the page. Resetting
    // the minimum lets the height actually bind and the inner columns scroll.
    <main className="grid min-h-full flex-1 lg:h-dvh lg:min-h-0 lg:grid-cols-[40%_60%] lg:overflow-hidden">
      {/* Form first in the DOM and on the left: it is what the page is FOR, and
          a keyboard or screen-reader user reaches it without traversing the
          panel. */}
      <section className="relative z-10 flex flex-col gap-8 px-6 py-10 sm:px-10 lg:overflow-y-auto lg:px-12 xl:pl-20 xl:pr-16">
        {/* A whisper of the brand on the form side too, so the light column
            isn't a blank sheet where it meets the panel. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(90%_100%_at_50%_0%,color-mix(in_oklch,var(--primary)_7%,transparent),transparent_70%)]"
        />

        <div className="login-rise relative shrink-0">
          <Image
            src={LOGO.src}
            alt="Jeppiaar Engineering College"
            width={LOGO.width}
            height={LOGO.height}
            priority
            className="h-auto w-[12.5rem] max-w-full sm:w-[14rem]"
          />
        </div>

        {/* flex-1 + justify-center puts the form in the OPTICAL centre of the
            space left between crest and footer, rather than letting
            justify-between fling the three blocks to the extremes — which left
            a dead band the height of the form itself under the logo. */}
        <div
          className="login-rise relative flex w-full max-w-sm flex-1 flex-col justify-center"
          style={{ animationDelay: "90ms" }}
        >
          {children}
        </div>

        <p
          // Tracking tightens and wrapping is disabled from lg up: at that
          // breakpoint the form column is ~410px and the wide-tracked line
          // wrapped onto a second row that the pinned viewport height then cut
          // in half.
          className="login-rise relative shrink-0 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground/70 lg:whitespace-nowrap lg:text-[0.65rem] lg:tracking-[0.1em]"
          style={{ animationDelay: "180ms" }}
        >
          Jeppiaar Engineering College · Chennai
        </p>
      </section>

      <BrandPanel />
    </main>
  );
}
