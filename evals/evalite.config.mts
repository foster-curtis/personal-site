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
  testTimeout: 60_000,
});
