import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        plugins: [tsconfigPaths(), react()],
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/setup/env.ts"],
          globals: true,
        },
      },
      {
        plugins: [tsconfigPaths(), react()],
        test: {
          name: "api",
          environment: "node",
          include: ["tests/api/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/setup/env.ts"],
          globals: true,
        },
      },
      {
        plugins: [tsconfigPaths(), react()],
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/components/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/setup/env.ts", "tests/setup/dom.ts"],
          globals: true,
        },
      },
      {
        plugins: [tsconfigPaths(), react()],
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/setup/env.ts"],
          globals: true,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
