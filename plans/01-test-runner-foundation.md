# Phase 01 — Test Runner Foundation

**Depends on:** [00-prerequisites.md](00-prerequisites.md) (needs `node_modules`
installed; doesn't strictly need the schema-capture or env work, but do Phase 0 first
regardless since it's fast and this plan assumes it's done).

## Context

`personal-site` is a Next.js 16.1.4 / React 19.2 / TypeScript AI-powered interactive
resume (Supabase + Google Gemini for RAG chat, job-fit analysis, and peer-feedback
summarization) that currently has zero tests. This phase builds the shared test
infrastructure — runner, config, mocking helpers — that every other testing phase
(02–07) is built on top of. Full project context and decisions in [README.md](README.md).

## Runner choice: Vitest (not Jest)

This is settled, not open for re-debate — but the reasoning matters for how you configure
it. Next.js officially documents four supported test tools (Cypress, Jest, Playwright,
Vitest — <https://nextjs.org/docs/app/guides/testing>) with no single recommendation, so
this is a preference among supported options. Decisive reasons for *this* repo:
`tsconfig.json` sets `moduleResolution: "bundler"` and `module: "esnext"`,
`package.json` has no `"type"` field, and the project already uses `.mjs` config files —
Vitest consumes all of that natively while Jest needs a transform chain to match. Vitest
also handles the `@/*` path alias via `vite-tsconfig-paths` with no duplicate mapping to
maintain against `tsconfig.json`, and its `vi.mock` ESM interception is what makes
Phase 03's module-boundary mocking clean.

## Install

```bash
npm install -D vitest @vitest/coverage-v8 @vitejs/plugin-react vite-tsconfig-paths \
  jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Versions verified against the npm registry (verify they're still current when you run
this — pin to whatever's latest stable if these have moved):

| Package | Version at time of writing | Note |
|---|---|---|
| `vitest` + `@vitest/coverage-v8` | 4.1.10 | v4, not v3 — config uses `test.projects`, not the old `workspace` file |
| `@vitejs/plugin-react` | 6.0.5 | |
| `vite-tsconfig-paths` | 6.1.1 | reuses the `@/*` alias from `tsconfig.json` |
| `@testing-library/react` | 16.3.2 | **v16 is required** for React 19 compatibility — do not install v14/v15 |

**Known gotcha to check before relying on it:** `@testing-library/jest-dom`'s TypeScript
matcher augmentation had an open issue on Vitest 4.1.6/4.1.7 (`Property 'toBeInTheDocument'
does not exist on type 'Assertion<...>'` — runtime fine, types broken;
<https://github.com/vitest-dev/vitest/issues/10411>). After installing, write one trivial
component test using a `jest-dom` matcher and confirm `tsc --noEmit` is clean on it before
building anything on top. If it's still broken on whatever Vitest version installs, pin
`vitest@4.1.5` instead of latest.

## Config: `vitest.config.mts`

Define **four projects** so each test category gets the right environment, and the
slow/expensive ones don't run by default:

| Project | Environment | Include | Runs on plain `npm test`? |
|---|---|---|---|
| `unit` | `node` | `tests/unit/**` | ✅ |
| `api` | `node` | `tests/api/**` | ✅ |
| `components` | `jsdom` | `tests/components/**` | ✅ |
| `db` | `node` | `tests/db/**` | ❌ opt-in only, needs Docker + Supabase CLI (Phase 06) |

**This environment split is load-bearing, not a style choice.** Route handler tests
(`api` project) must run under `node`, never `jsdom` — jsdom has no `fetch`/`Request`/
`Response` implementation, and Next's `NextResponse.json()` needs Node's native
`Response.json()` static method (Node 18.13+). If you consolidate `api` into the
`components` project under jsdom, every route handler test will fail with something like
`ReferenceError: Request is not defined`.

Use `tsconfigPaths()` and `react()` plugins in every project so the `@/*` alias and JSX
work identically to the app itself.

## Supporting files

- `tests/setup/env.ts` — sets deterministic fake env vars for the whole suite (fake
  Supabase URL/keys, fake `GEMINI_API_KEY`, a fixed `OWNER_EMAIL`), and pins `TZ=UTC` plus
  a fixed locale. Several dashboard components format dates locale-dependently (e.g.
  `app/dashboard/feedback/page.tsx:159`) — without pinning this, tests will pass locally
  and fail in CI (or vice versa) depending on the runner's default locale/timezone.
- `tests/setup/dom.ts` — imports `@testing-library/jest-dom` matchers and relies on
  Testing Library's auto-cleanup after each test (works automatically when Vitest's
  `globals: true` is set — if you disable globals, you must call `cleanup()` manually in
  an `afterEach`).
- `tests/helpers/supabase-mock.ts` — **the single highest-value file in this phase.**
  Build a chainable thenable builder that fakes the Supabase query-builder shape used
  throughout the codebase:
  - `.from(table).select().eq().in().order().limit().single()`
  - `.from(table).insert(...).select().single()`
  - `.from(table).update(...).eq()`
  - `.from(table).delete().eq()`
  - `.from(table).select("*", { count: "exact", head: true })`
  - `.rpc(name, params)` — the only real call site is `match_embeddings` in `lib/rag.ts:20`
  - `.storage.from(bucket).upload()/.remove()/.createSignedUrl()`
  - `.auth.getUser()/.getSession()/.signOut()/.exchangeCodeForSession()/.onAuthStateChange()`
  - `.auth.admin.listUsers()` — used by the public `job-compare` and `owner/resume` routes
    to find the owner by email without a direct users-table query

  Design it so a test can queue per-table results, e.g. "the next `feedback_links` lookup
  returns X, the next insert on `feedback_responses` fails with error Y" — tests should
  read as a script of what the fake database does, not a maze of nested mock returns.
  Include a helper for constructing a `PGRST116` error (PostgREST's "no rows returned from
  `.single()`" code), since three different route handlers branch on that code by name.

  All three real Supabase client constructors (`lib/supabase/admin.ts`,
  `lib/supabase/client.ts`, `lib/supabase/server.ts`) are synchronous or async **factory
  functions called at request time** — none of them are module-level singletons — so
  `vi.mock("@/lib/supabase/admin")` etc. cleanly replaces them without any import-order
  tricks.
- `tests/helpers/request.ts` — builders for constructing `NextRequest` objects: one for
  JSON bodies, one for query-string GET requests, one for `FormData` (needed for the file
  upload route), and a helper for the async `params` Promise wrapper the `[id]`-style
  dynamic routes expect (Next.js 15+ made `params` an async Promise; this repo is already
  on that convention — see `RouteParams` in `app/api/data/[id]/route.ts`).

## Scripts (add to `package.json`)

- `test` — runs the default projects (`unit`, `api`, `components`) once
- `test:watch` — same, in watch mode
- `test:ui` — Vitest's UI mode
- `test:coverage` — `test` with `@vitest/coverage-v8` coverage reporting
- `test:db` — runs only the `db` project (Phase 06)
- `test:e2e` — Playwright (Phase 05)
- `test:eval` — the eval suite (Phase 07)
- `typecheck` — `tsc --noEmit`

## Other housekeeping in this phase

- Add a `tests/**` override block to `eslint.config.mjs` so `describe`/`it`/`expect`
  globals don't trigger no-undef-style lint errors.
- Add `test-results/`, `playwright-report/`, and `.vitest/` to `.gitignore`. Note
  `/coverage` is already ignored (leftover from `create-next-app`), so you don't need to
  add that one.

## Explicitly considered and rejected

- **`next-test-api-route-handler`** (v5.0.6, still actively maintained) — a package for
  invoking route handlers more ergonomically. Its README claims support through Next
  14/15 but doesn't explicitly claim Next 16 support, and directly importing and calling
  the exported `GET`/`POST`/etc. functions with a constructed `Request` needs no extra
  dependency at all — so there's nothing to gain by adding it here. Phase 03 uses direct
  invocation.
- **MSW (Mock Service Worker)** for mocking Gemini — not needed as the default. All
  Gemini access already funnels through the single `lib/gemini/client.ts` module, so
  `vi.mock("@/lib/gemini/client")` is sufficient for every case in Phases 02–03. Reach for
  MSW later only if you need to assert on the literal HTTP payload sent to Google.
  Playwright's built-in `page.route()` covers Phase 05's E2E mocking needs without MSW.

## Verification

- `npm test` runs and reports 0 tests found (nothing to test yet — that's expected and
  fine at the end of this phase) but exits 0, not with a config error.
- `npm run typecheck` and `npm run lint` are both clean.
- Write one throwaway smoke test in each of the three default projects (`tests/unit/smoke.test.ts`,
  `tests/api/smoke.test.ts`, `tests/components/smoke.test.tsx`) that just asserts
  `expect(true).toBe(true)` and confirm all three run under `npm test` with the correct
  environment (log `typeof window` in each to confirm `node` vs `jsdom` split is real,
  then delete the smoke tests once confirmed).
- Confirm `npm run test:db` and `npm run test:e2e` exist as scripts and fail gracefully
  (not with a config crash) since Phases 05/06 haven't populated them yet.

## Commit

One commit for this phase, e.g.:
`test: add Vitest runner, project split, and Supabase/request mocking helpers`
