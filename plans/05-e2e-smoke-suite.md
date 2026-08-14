# Phase 05 — E2E Smoke Suite

**Depends on:** [01-test-runner-foundation.md](01-test-runner-foundation.md) loosely (for
overall project conventions, but this phase's tooling — Playwright — is independent of
Vitest). Requires the app to be buildable/runnable (`npm run build && npm run start`, or
`npm run dev`). Independent of Phases 02–04, 06, 07; can be worked in parallel.

## Context

`personal-site` is a Next.js/TypeScript AI-powered interactive resume (Supabase + Google
Gemini), **not yet deployed**. This phase adds a deliberately small Playwright E2E suite —
E2E here exists to prove "the wiring is real end-to-end," not to chase branch coverage
(that's what Phases 02–04 are for). Full project context is in [README.md](README.md).

## Setup

```bash
npm init playwright@latest
```

Version at time of writing: `@playwright/test` 1.62.1 — verify current when you run this.

Playwright is the clear choice over Cypress here: Cypress's Next.js component-testing
story requires `bundler: 'webpack'`, but Next.js 16 made Turbopack the default bundler,
which is a growing mismatch. There is no reason to introduce Cypress into a project with
no existing Cypress investment.

Per the official Next.js Playwright guide
(<https://nextjs.org/docs/app/guides/testing/playwright>): *"We recommend running your
tests against your production code to more closely resemble how your application will
behave"* — i.e. test against `next build && next start`, not `next dev`. Configure
Playwright's `webServer` option to build and start the app itself, and set
`use.baseURL: 'http://localhost:3000'` so tests can use relative `page.goto('/')` calls.

Write specs under `tests/e2e/`.

## Test list (keep this list short — resist the urge to expand it)

1. **Home page** (`/`) — renders, and both CTA links ("Chat with AI", "Analyze Job Fit")
   navigate to `/chat` and `/job-analysis` respectively.
2. **Chat flow** (`/chat`) — type a question into the input, submit, and see a rendered
   assistant response appear. Intercept the Gemini-bound network call via Playwright's
   `page.route()` so this test is deterministic and doesn't spend real API quota; return a
   canned successful `/api/chat` response instead of routing all the way to Google. (If
   you'd rather intercept at the `/api/chat` boundary itself instead of further upstream,
   that's simpler and equally valid — either way, no real Gemini call should happen in
   this suite.)
3. **Job analysis flow** (`/job-analysis`) — paste a job description, submit, see a
   rendered analysis result. Same network-interception approach as above.
4. **Feedback form flow** (`/feedback/[token]`) — using a seeded/mocked valid token, load
   the form, fill it out, submit, and see the "thank you" success state render.
5. **Auth guard** — this is the coverage gap Phase 04 explicitly left for E2E, since async
   Server Components can't be unit tested:
   - An anonymous visit to `/dashboard` redirects to `/login`.
   - A signed-in **non-owner** user visiting `/dashboard` redirects to `/access-denied`.
   You'll need a way to simulate an authenticated-but-non-owner session — either a test
   Supabase user, or by intercepting/mocking the session check at the network boundary
   (`/api/auth/session`) depending on how heavy you want this test to be. Prefer the
   lighter network-mock approach unless the real auth flow itself needs verifying.
6. **References page** (`/references`) — with no peer feedback seeded, confirm the
   "no feedback available yet" empty state renders cleanly rather than erroring.

Keep this list at 6 flows. If you find yourself wanting to add a 7th, ask whether it
would be better served by a Phase 02–04 test instead — E2E is expensive to run and
maintain relative to unit/integration tests, so it should stay reserved for things that
specifically need a real browser and real routing.

## Verification

- `npm run build` succeeds.
- `npm run test:e2e` runs all 6 flows against the production build and all pass.
- Confirm no test in this suite makes a real network call to `generativelanguage.googleapis.com`
  (Gemini) — check Playwright's network log/trace for each test if unsure.
- Run the suite twice in a row and confirm it's not flaky (no test-order dependency, no
  leftover state between runs — e.g. the feedback-form test's seeded token shouldn't get
  consumed/invalidated in a way that breaks a second run).

## Commit

One commit for this phase, e.g.:
`test: add Playwright E2E smoke suite for chat, job analysis, feedback, and auth guard`
