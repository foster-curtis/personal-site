// A tiny stand-in for Supabase's GoTrue auth server, used only by the E2E
// "signed-in non-owner" auth-guard test (tests/e2e/auth-guard.spec.ts).
//
// Why this exists: app/dashboard/layout.tsx is an async Server Component
// that calls supabase.auth.getUser() directly on the Next.js server. That
// call happens entirely inside the Node process running `next start` — it
// never passes through the browser — so Playwright's page.route()/
// context.route() (which only intercept requests the browser makes) cannot
// mock it. The only way to control what that server-side call sees is to
// point NEXT_PUBLIC_SUPABASE_URL at a real, reachable HTTP server. This
// file is that server: it implements just the one GoTrue endpoint
// (`GET /auth/v1/user`) that getUser() calls, and always returns a fixed
// non-owner user. See NON_OWNER_EMAIL below, which must match the value
// used in tests/e2e/auth-guard.spec.ts to build the matching session cookie.
//
// No other test in this suite depends on this server: every other flow is
// mocked at the browser boundary via page.route(), and getUser() skips the
// network call entirely when there's no session cookie (the default for a
// fresh Playwright browser context) so anonymous requests never reach here.
import { createServer } from "node:http";

// Must match MOCK_GOTRUE_PORT in playwright.config.ts.
const PORT = 4010;
// Must match NON_OWNER_EMAIL in tests/e2e/auth-guard.spec.ts.
const NON_OWNER_EMAIL = "nonowner@example.com";

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url?.startsWith("/auth/v1/user")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "00000000-0000-0000-0000-0000000000aa",
        aud: "authenticated",
        role: "authenticated",
        email: NON_OWNER_EMAIL,
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: {},
        created_at: "2024-01-01T00:00:00.000Z",
      })
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-gotrue] listening on http://127.0.0.1:${PORT}`);
});
