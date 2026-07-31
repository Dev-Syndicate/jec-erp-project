// Test double for `@/lib/db`.
//
// These are UNIT tests: nothing here may touch Neon. The real module opens a
// WebSocket connection to a database that holds real student PII. Every property
// access throws, so a test that accidentally reaches the database fails loudly with
// a clear message instead of silently connecting.
const reject = (prop: string): never => {
  throw new Error(
    `Unit tests must not touch the database (attempted db.${prop}). ` +
      `If you need real DB behaviour, write a separate integration suite ` +
      `against a throwaway database — see docs/PROJECT-GUIDE.md §7.`,
  );
};

export const db = new Proxy(
  {},
  {
    get: (_t, prop) => reject(String(prop)),
  },
);
