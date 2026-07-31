// Vitest — unit tests only, NO database and NO network.
//
// Several modules under test (`lib/auth`, `lib/rbac/ability`, `lib/student-import`)
// import `server-only`, and `lib/auth` additionally imports `lib/db` +
// `lib/firebase-admin` at module scope. Importing those for real would open a Neon
// connection and demand Firebase credentials, so we alias all three to inert test
// doubles. The functions we actually exercise (`authorize`, `can`,
// `defineAbilityFor`, `parseStudentSheet`) are pure and touch none of them.
//
// If you ever add tests that need real DB behaviour, do NOT loosen these aliases —
// write a separate integration project with its own throwaway database. The dev DB
// holds real student PII (see docs/PROJECT-GUIDE.md §7).
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // `import "server-only"` throws outside a server bundle — no-op it.
      "server-only": r("./test/stubs/server-only.ts"),
      // Hard blocks: importing either for real would reach Neon / Firebase.
      "@/lib/db": r("./test/stubs/db.ts"),
      "@/lib/firebase-admin": r("./test/stubs/firebase-admin.ts"),
      // Keep the normal `@/` → src alias last so the specific ones above win.
      "@": r("./src"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Fail loudly rather than silently passing an empty suite.
    passWithNoTests: false,
  },
});
