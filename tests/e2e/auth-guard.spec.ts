import { test, expect } from "@playwright/test";

// app/dashboard/layout.tsx is an async Server Component that calls
// supabase.auth.getUser() directly on the Next.js server — that call never
// passes through the browser, so page.route()/context.route() can't mock it.
// The anonymous case below needs no mocking at all: with no session cookie,
// getUser() short-circuits locally without making any network call. The
// non-owner case needs a real HTTP round trip, so it talks to the local
// mock GoTrue server (tests/e2e/mock-gotrue-server.mjs) that
// NEXT_PUBLIC_SUPABASE_URL points at for this whole suite, via a
// hand-built Supabase session cookie in the exact shape @supabase/ssr reads.

// Must match MOCK_GOTRUE_PORT in playwright.config.ts.
const MOCK_GOTRUE_URL = "http://127.0.0.1:4010";
// Must match NON_OWNER_EMAIL in tests/e2e/mock-gotrue-server.mjs.
const NON_OWNER_EMAIL = "nonowner@example.com";

// @supabase/supabase-js derives the auth cookie name from the project URL:
// `sb-${hostname.split(".")[0]}-auth-token`.
const AUTH_COOKIE_NAME = `sb-${new URL(MOCK_GOTRUE_URL).hostname.split(".")[0]}-auth-token`;

function buildAuthCookieValue(): string {
  const oneYearFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const session = {
    access_token: "e2e-mock-access-token",
    refresh_token: "e2e-mock-refresh-token",
    expires_at: oneYearFromNow,
    expires_in: 60 * 60 * 24 * 365,
    token_type: "bearer",
    user: {
      id: "00000000-0000-0000-0000-0000000000aa",
      aud: "authenticated",
      role: "authenticated",
      email: NON_OWNER_EMAIL,
      app_metadata: {},
      user_metadata: {},
    },
  };
  // @supabase/ssr's default cookie encoding: base64url(JSON), prefixed.
  return (
    "base64-" + Buffer.from(JSON.stringify(session), "utf-8").toString("base64url")
  );
}

test.describe("Auth guard on /dashboard", () => {
  test("anonymous visitor is redirected to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signed-in non-owner is redirected to /access-denied", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      {
        name: AUTH_COOKIE_NAME,
        value: buildAuthCookieValue(),
        url: baseURL,
      },
    ]);

    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/access-denied$/);
    await expect(
      page.getByRole("heading", { name: /whoa there, friend/i })
    ).toBeVisible();
  });
});
