# NOTES

Known gaps that are **deliberately not fixed yet**, recorded so they aren't rediscovered the
hard way. Source: [plans/09-devops-recommendations.md](plans/09-devops-recommendations.md).

The site is **not deployed yet**. Everything below is either blocked on deployment existing,
or is a repo-settings change that has to happen in the GitHub UI.

---

## 1. Rate limiting is not enforced — launch blocker

**Status:** open. Must be closed *before* the site is publicly reachable.

`middleware.ts` sets `X-RateLimit-Limit` / `X-RateLimit-Window` response headers on `/api/*`
and nothing else. They are **informational only** — no code path rejects a request for
exceeding them. The file's own comments say so, deferring enforcement to infrastructure that
doesn't exist yet.

These three routes are public, unauthenticated, and each burns real Gemini quota per request:

- `app/api/chat/route.ts`
- `app/api/job-compare/route.ts`
- `app/api/feedback/submit/route.ts`

That is an **uncapped billing liability** the moment the site becomes reachable — anyone can
script against those endpoints with no limit.

**Fix at deploy time, one of:**

- Vercel Firewall / rate limiting rules (likely, given the Supabase + Next.js deployment
  target), or
- `@upstash/ratelimit` as a Redis-backed alternative if not on Vercel.

Do not "fix" the headers themselves as if they were broken — they're doing what they were
written to do. The missing piece is enforcement in front of the app.

---

## 2. Error monitoring: nothing is collecting logs — decision pending

**Status:** open, decide at deploy time.

`lib/logging.ts` emits structured JSON via `console.*`. On a serverless platform (Vercel
included) that stdout goes nowhere unless something is actively collecting it — so in
production today, **every `logger.error(...)` call is effectively silent**. This needs fixing
regardless of which tool wins below.

**Decision to make: PostHog vs. Sentry.**

- The project already ships `posthog-js`, and PostHog now has first-party error tracking
  (<https://posthog.com/docs/error-tracking/installation/nextjs>). **Check whether that covers
  what's needed first** — before adding a second SDK and a second bill.
- Reach for Sentry (`@sentry/nextjs`) specifically if either of these turns out to matter:
  - release-tagged stack traces with sourcemaps, or
  - distributed tracing across the RAG call chain (route handler → embedding call → pgvector
    query → Gemini generation call).

  Those are a heavier bar than PostHog's error tracking currently clears.

---

## 3. Secret scanning / push protection — repo setting, not code

**Status:** to be confirmed enabled in GitHub (Settings → Code security).

This repo handles `SUPABASE_SERVICE_ROLE_KEY`, which bypasses Row Level Security entirely.
A leak of that one secret is a full data breach, not a theoretical risk.

---

## 4. Smaller deferred items

- **E2E against real preview deployments.** Once Vercel preview URLs exist per PR, switch the
  `e2e` job in `.github/workflows/ci.yml` to run against them instead of a locally-built
  server. The Vercel Deployment Protection bypass-header gotcha is already written up in that
  workflow's `e2e` job comments — read it before wiring this up.
- **Automated accessibility checks.** The components carry real a11y wiring (ARIA labels,
  roles) and a past commit was dedicated to security-and-accessibility work, but nothing
  automated guards it from regressing. Adding `@axe-core/playwright` to the existing
  Playwright specs is roughly an hour's work whenever there's appetite.
- **`middleware.ts` → `proxy.ts` rename.** Next.js 16 deprecated (not removed) the
  `middleware.ts` / `export function middleware` convention in favor of `proxy.ts` /
  `export function proxy`. Fully functional as-is. The official codemod
  (`npx @next/codemod@canary upgrade latest`) handles the rename during a future Next.js
  upgrade — don't do it by hand now.
