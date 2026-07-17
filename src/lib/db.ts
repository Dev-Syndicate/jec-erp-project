// Prisma client singleton — the ONLY place the app talks to Neon.
//
// Uses Neon's serverless driver via Prisma's driver adapter (the stack decided
// in CLAUDE.md). We use the WebSocket adapter (PrismaNeon), NOT the HTTP one:
// Neon's HTTP mode cannot run transactions, and core flows are transactional —
// leave/OD approval must atomically mark attendance (and a rejection must leave
// it untouched), bulk attendance and bulk promote write many rows as a unit.
// `upsert` also runs in an implicit transaction. Neon bills by compute time,
// not per-connection, so WS costs no more than HTTP here while avoiding a
// class of runtime failures — the cost-effective AND correct choice.
//
// Runtime queries use DATABASE_URL (Neon's POOLED endpoint). Migrations use
// DIRECT_URL and never go through this file (see prisma.config.ts).
//
// This is server-only. Importing it from client code would leak the connection
// string into the bundle — the one thing CLAUDE.md's security boundary forbids.
import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "@/generated/prisma/client";

// The WS driver needs a WebSocket constructor in Node (browsers have one built
// in, but API routes run in Node).
neonConfig.webSocketConstructor = ws;

const rawConnectionString = process.env.DATABASE_URL;
if (!rawConnectionString) {
  throw new Error("DATABASE_URL is not set — cannot initialise the database client.");
}

// Strip `channel_binding=require`: it interferes with Neon's WebSocket proxy
// (fine for the HTTP driver, breaks the WS handshake used for transactions).
const connectionString = rawConnectionString
  .replace(/([?&])channel_binding=require&?/, "$1")
  .replace(/[?&]$/, "");

function createClient() {
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({
    adapter,
    // Neon free-tier compute scales to zero. The FIRST transaction after idle
    // has to wait for the WS handshake + compute wake, which blows past the
    // default maxWait of 2000ms and 500s the request. Raise it so cold starts
    // wait for the DB instead of failing. `timeout` bounds the txn once open.
    transactionOptions: { maxWait: 15_000, timeout: 20_000 },
  });
}

// Reuse one client across hot-reloads in dev; a fresh one per cold start in prod.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
