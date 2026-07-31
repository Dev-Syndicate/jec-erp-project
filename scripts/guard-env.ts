// Environment guard for the out-of-band scripts (wipe, imports, password resets).
//
// The problem this solves: every script here builds its own Prisma + Firebase
// client from whatever `dotenv/config` happens to load. Nothing in the script
// itself knows whether that env is test or production, so a stale shell or a
// copied .env silently points a destructive run at real student data.
//
// The contract: `ERP_ENV` must be set explicitly, and `assertTestEnv()` refuses
// anything that is not exactly "test". There is deliberately NO override flag —
// production is bootstrapped and maintained through the app's own UI importer,
// not by running a wipe from a laptop. To ever run one of these against prod you
// have to edit this file, which is a conscious act that shows up in a diff.
//
// It also cross-checks the Neon host against ERP_ENV, so mislabelling the env
// (ERP_ENV=test next to the prod connection string) is caught rather than
// trusted — the label alone is not evidence.

/** Hosts that must never be touched by a destructive script. */
const PRODUCTION_HOST_MARKERS = ["ep-muddy-frost"];

function neonHost(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/** Human-readable description of what the current env points at. */
export function describeEnv(): string {
  return [
    `  ERP_ENV  : ${process.env.ERP_ENV ?? "(unset)"}`,
    `  Neon     : ${neonHost() || "(unparseable)"}`,
    `  Firebase : ${process.env.FIREBASE_ADMIN_PROJECT_ID ?? "(unset)"}`,
  ].join("\n");
}

/**
 * Refuse to continue unless this process is pointed at the TEST environment.
 * Call FIRST in any script that deletes or bulk-creates rows, before building
 * a Prisma or Firebase client.
 */
export function assertTestEnv(scriptName: string): void {
  const env = process.env.ERP_ENV;
  const host = neonHost();
  const looksProduction = PRODUCTION_HOST_MARKERS.some((m) => host.includes(m));

  if (env !== "test") {
    throw new Error(
      `${scriptName} refuses to run: ERP_ENV must be "test".\n` +
        `${describeEnv()}\n\n` +
        `This script mutates data in bulk and is only ever run against the test\n` +
        `environment. Production is maintained through the app's own importer.`,
    );
  }

  // ERP_ENV says test — verify the connection string agrees, so a mislabelled
  // env file can't smuggle a production host past the check above.
  if (looksProduction) {
    throw new Error(
      `${scriptName} refuses to run: ERP_ENV is "test" but the database host\n` +
        `looks like PRODUCTION.\n${describeEnv()}\n\n` +
        `Fix the env file — do not relax this check.`,
    );
  }

  console.log(`${scriptName} — environment check passed:\n${describeEnv()}\n`);
}
