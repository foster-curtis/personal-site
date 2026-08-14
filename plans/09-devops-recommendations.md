# Phase 09 — DevOps Recommendations

**Depends on:** the env-validation item below assumes [00-prerequisites.md](00-prerequisites.md)
Task 0.3 (`.env.example`, `lib/env.ts`) is done — do that first if it isn't. Everything
else in this phase is independent and can be done in any order, in parallel with any other
phase.

## Context

`personal-site` is a Next.js/TypeScript AI-powered interactive resume (Supabase + Google
Gemini), **not yet deployed**. This phase covers QA/DevOps concerns beyond the test suite
itself — things worth doing now versus things to defer until the site actually goes live.
Full project context is in [README.md](README.md).

## Do now, alongside the test-suite work

### Env validation
If [00-prerequisites.md](00-prerequisites.md) Task 0.3 hasn't been done yet, do it as
part of this phase instead: `lib/env.ts` that validates required server-side env vars
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GEMINI_API_KEY`, `OWNER_EMAIL`) at module load and throws one readable error listing
everything missing. A missing `GEMINI_API_KEY` should fail loudly at boot, not surface as
a confusing 500 the first time someone tries the chat feature.

### Dependabot
Add `.github/dependabot.yml` — weekly cadence, grouped minor/patch updates, gated on
whatever CI checks Phase 08 sets up as required. Dependabot over Renovate here
specifically because this is a single-package GitHub repo with no monorepo/workspace
structure — Dependabot is zero-config and GitHub-native for that case. Renovate only wins
decisively once there's a monorepo or a need for finer-grained update-scheduling policy,
neither of which applies here.

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      minor-and-patch:
        update-types: ["minor", "patch"]
```

### Secret scanning
Enable GitHub's secret scanning / push protection on the repository (Settings → Code
security). This repo handles a `SUPABASE_SERVICE_ROLE_KEY`, which bypasses Row Level
Security entirely — a leak of that specific secret is a full data breach, not a
theoretical risk. This is a repo-settings change, not a code change; do it directly in
GitHub settings.

### Housekeeping note, not urgent
`middleware.ts` uses the filename and `export function middleware` convention that
Next.js 16 deprecated in favor of `proxy.ts` / `export function proxy` (deprecated, not
removed — it's fully functional as-is on the project's current 16.1.4). An official
codemod (`npx @next/codemod@canary upgrade latest`) handles this rename automatically as
part of any future Next.js version upgrade. No need to do this rename manually now; just
don't be surprised by it showing up as a deprecation warning later.

## Do at actual deploy time (not now — nothing to point these at yet)

### Error monitoring: check PostHog before adding Sentry
The project already ships `posthog-js`, and PostHog now has first-party error tracking
(<https://posthog.com/docs/error-tracking/installation/nextjs>) — check whether that
covers what's needed before adding a second SDK and a second bill. Reach for **Sentry**
(`@sentry/nextjs`) specifically if release-tagged stack traces with sourcemaps, or
distributed tracing across the RAG call chain (route handler → embedding call → pgvector
query → Gemini generation call), turn out to be needed — that's a heavier bar than
PostHog's error tracking currently clears. Either way: the structured logger in
`lib/logging.ts` currently writes to stdout via `console.*`, which vanishes on serverless
platforms (including Vercel) unless something is actually collecting it — so right now,
in production, every `logger.error(...)` call is effectively silent. This is worth fixing
whichever monitoring tool gets chosen.

### Enforce rate limiting — flagged as a real pre-launch risk, not just nice-to-have
`middleware.ts` currently only sets **informational** `X-RateLimit-*` response headers; it
does not actually enforce any limit. The code comments in the file itself say as much,
deferring real enforcement to infrastructure that doesn't exist yet. `/api/chat`,
`/api/job-compare`, and `/api/feedback/submit` are all public, unauthenticated, and each
burns real Gemini API quota per request. **This is an uncapped billing liability the
moment this site becomes publicly reachable** — anyone can script requests against these
endpoints with no limit. Close this with Vercel's Firewall/rate-limiting feature (if
deploying to Vercel, which the codebase's Supabase/Next combination suggests) or
`@upstash/ratelimit` as a Redis-backed alternative, **before** the site goes live, not
after.

### E2E against real preview deployments
Once the site is actually deployed and Vercel preview URLs exist for PRs, extend
Phase 08's `e2e` job to run against those preview URLs instead of a locally-built server.
See the "Deferred to actual deployment" section of
[08-ci-pipeline.md](08-ci-pipeline.md) for the specific Vercel Deployment Protection
bypass-header gotcha to handle when wiring this up.

## Considered and deliberately deferred

**Automated accessibility checks** (`@axe-core/playwright`, Lighthouse CI). The
components already carry real accessibility wiring (ARIA labels, roles — see Phase 04's
`PromptMarquee` test for an example of what's already there), and a prior commit in this
repo's history was specifically dedicated to security-and-accessibility work. That effort
currently has nothing automated guarding it from regressing, which is worth noting even
though it's not being built in this pass. Adding `@axe-core/playwright` to the Phase 05
Playwright specs is roughly a one-hour addition whenever there's appetite for it — a good
candidate for a future small phase rather than something to fold into this one.

## Verification

- `.env.example` exists and documents all required vars; deliberately unsetting a required
  one causes a clear, immediate startup error rather than a deep runtime crash (verify
  this was actually done, whether by this phase or by Phase 00).
- `.github/dependabot.yml` exists and validates against GitHub's schema (it'll show up
  correctly in the repo's Insights → Dependency graph → Dependabot tab once merged).
- Secret scanning / push protection is confirmed enabled in repo settings (check
  Settings → Code security in the GitHub UI).
- Document the rate-limiting gap and the PostHog-vs-Sentry decision in a short note
  (e.g. a `NOTES.md` or a tracked issue) if they're not being fixed in this same pass, so
  they aren't lost — these are the two items in this phase with real launch-blocking
  consequences if forgotten.

## Commit

One commit for this phase, e.g.:
`chore: add Dependabot config and env validation; document rate-limiting and monitoring gaps`
