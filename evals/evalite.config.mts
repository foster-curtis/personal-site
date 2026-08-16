import { defineConfig } from "evalite/config";
import { createInMemoryStorage } from "evalite/in-memory-storage";

// evalite's default result storage is SQLite (`better-sqlite3`), which needs a native build
// — confirmed to fail here (no prebuilt binary for this Node version on Windows, and no
// working Python 3 / node-gyp toolchain present). Defaulting to the zero-native-deps
// in-memory backend so `npm run test:eval` (one-shot `evalite run`) works without extra
// setup. This only costs `evalite watch`'s cross-run history in its local review UI — if
// you've got a working Python 3 + build-tools setup and want that, swap back to SQLite:
//   import { createSqliteStorage } from "evalite/sqlite-storage";
//   export default defineConfig({ storage: () => createSqliteStorage("./node_modules/.evalite/cache.sqlite"), ... });
export default defineConfig({
  storage: () => createInMemoryStorage(),
  setupFiles: ["./setup/env.ts"],
  // Generous: job-compare/chat route handlers swallow the real Gemini error into a generic
  // 500, so with-retry.ts can't fast-fail those on a daily-quota/404 the way it can for
  // direct (non-route) calls — worst case is ~6 backing-off attempts, which can approach
  // 3 minutes on its own.
  testTimeout: 240_000,
  // Serialize eval execution: the Gemini free tier's per-minute quota (confirmed by hand:
  // 5 requests/min for generateContent) is far below what firing every eval file's calls
  // concurrently (evalite's default) produces. helpers/with-retry.ts handles the 429s that
  // still happen even serialized; this just keeps the burst rate down to begin with.
  maxConcurrency: 1,
});
