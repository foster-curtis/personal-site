import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Deliberately separate from the repo-root vitest.config.mts. That file defines
// `test.projects`, and Vitest's projects mode ignores any include/exclude passed in
// programmatically by evalite's own runner — running `evalite` against the root config
// silently runs the *entire* mocked test suite instead of `evals/*.eval.ts` (confirmed by
// hand while building this phase). Giving `evals/` its own Vite root sidesteps that:
// `npm run test:eval` cds into this directory first, so this file — not the root config —
// is what Vite discovers.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Runs once for the whole `evalite run` process (not per file/worker), so fixture
    // knowledge-base teardown happens exactly once regardless of how many eval files ran.
    globalSetup: ["./helpers/global-setup.ts"],
  },
});
