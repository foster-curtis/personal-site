import { defineConfig, devices } from "@playwright/test";

// Must match PORT in tests/e2e/mock-gotrue-server.mjs.
const MOCK_GOTRUE_PORT = 4010;
const MOCK_GOTRUE_URL = `http://127.0.0.1:${MOCK_GOTRUE_PORT}`;

// Fake, hermetic env for the whole E2E run. Every Supabase/Gemini-touching
// route is mocked at the browser boundary via page.route() (see specs), with
// the single exception of the server-side auth guard check in
// app/dashboard/layout.tsx, which is why NEXT_PUBLIC_SUPABASE_URL points at
// the local mock GoTrue server started below rather than a real project.
const APP_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: MOCK_GOTRUE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-fake-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "e2e-fake-service-role-key",
  GEMINI_API_KEY: "e2e-fake-gemini-key",
  GEMINI_MODEL: "gemini-2.5-flash",
  OWNER_EMAIL: "owner@example.com",
  OWNER_NAME: "Foster Curtis",
  NEXT_PUBLIC_OWNER_NAME: "Foster Curtis",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Two servers: the mock GoTrue stand-in (see tests/e2e/mock-gotrue-server.mjs
  // for why it's needed) and the Next.js app itself, built and started in
  // production mode per https://nextjs.org/docs/app/guides/testing/playwright.
  webServer: [
    {
      command: "node tests/e2e/mock-gotrue-server.mjs",
      port: MOCK_GOTRUE_PORT,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run build && npm run start",
      url: "http://localhost:3000",
      env: APP_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
