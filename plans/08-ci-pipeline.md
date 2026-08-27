# Phase 08 — CI Pipeline

**Depends on:** ideally Phases 01–07 all landed, since this phase wires their scripts
(`test`, `test:coverage`, `test:db`, `test:e2e`, `test:eval`, `typecheck`, `lint`,
`build`) into GitHub Actions. **You do not have to wait for all of them, though** — this
phase can be scaffolded early with jobs commented out or made non-blocking for whichever
phases haven't landed yet, then progressively enabled as each phase's scripts become
real. If you're picking this phase up and some referenced scripts don't exist yet, check
[README.md](README.md)'s phase index for what's landed, wire in what's ready, and leave a
`# TODO: enable once Phase 0X lands` comment for what isn't.

## Context

`personal-site` (GitHub: `foster-curtis/personal-site`) is a Next.js/TypeScript
AI-powered interactive resume, **not yet deployed**. It currently has no CI at all — no
`.github/` directory exists. Full project context is in [README.md](README.md).

## The workflow

Create `.github/workflows/ci.yml`, triggered on push and pull request to `main`.

| Job               | Contents                                                                          | Blocking?                                 |
| ----------------- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| `quality`         | `npm ci`, `npm run lint`, `npm run typecheck`, `npm test -- --coverage`           | ✅ required                               |
| `build`           | `npm run build` with dummy/placeholder env vars                                   | ✅ required                               |
| `e2e`             | Playwright (Phase 05), against the production build, with browser install caching | ✅ required                               |
| `retrieval-eval`  | The recall@5 golden-set check from Phase 07 — cheap, no generation call involved  | ✅ required                               |
| `db`              | `supabase start` + `supabase test db` / `npm run test:db` (Phase 06)              | non-blocking until it proves stable in CI |
| `generation-eval` | The `autoevals`-graded answer-grounding and prompt-injection checks from Phase 07 | weekly cron only, non-blocking            |

### Node version

Use **Node 22** in CI, not the local machine's Node 26. Reasons: it's Next.js 16's
documented minimum (20.9+), it's closer to what Vercel actually runs in production, and
`@testing-library/jest-dom` v7 (used in Phase 04) requires Node ≥22 as a floor. Don't
matrix multiple Node versions — for a solo project targeting a single fixed deployment
runtime, an OS/Node matrix triples CI minutes for near-zero signal. If you want to matrix
anything, matrix Playwright browser projects instead, not Node versions.

### Typecheck as its own step — don't rely on `build` to catch type errors

Turbopack (the default bundler since Next.js 16) does **not** typecheck during
`next build` the way the old Webpack path historically did. Run `npm run typecheck`
(`tsc --noEmit`) as an explicit, separate, blocking step in the `quality` job — otherwise
a real type error can currently pass a green build silently.

### Caching

Cache both `~/.npm` and `.next/cache`, keyed on `package-lock.json` and source file
hashes:

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      ${{ github.workspace }}/.next/cache
    key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx') }}
    restore-keys: |
      ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-
```

Without persisting `.next/cache` specifically, Next.js will emit its own
[No Cache Detected](https://nextjs.org/docs/messages/no-cache) warning on every run — that
warning is itself a useful signal that the cache config is wrong if you see it in CI logs
after setting this up.

### `db` job

Follow Supabase's own documented CI pattern (also noted in
[06-db-integration.md](06-db-integration.md)):

```yaml
- uses: supabase/setup-cli@v1
  with:
    version: latest
- run: supabase start --exclude studio,inbucket,imgproxy
- run: supabase test db
```

The `--exclude` flags trim boot time by skipping services this test suite doesn't need.
Keep this job non-blocking (`continue-on-error: true` or simply not in the required-checks
list) until it's proven stable over several runs — flaky infra-dependent CI jobs that are
required checks are worse than not having the job at all, since people learn to ignore or
force-merge past them.

### `generation-eval` job

```yaml
on:
  schedule:
    - cron: "0 6 * * *" # daily, adjust as preferred
  workflow_dispatch: {} # allow manual trigger too
```

Needs real `GEMINI_API_KEY` as a repository secret. Never wire this into the `push`/
`pull_request` triggers — it's judged/probabilistic per Phase 07's design and would
introduce flakiness into required checks if it ran there.

## Branch protection

Once this workflow is green on a test branch, configure branch protection on `main` to
require `quality`, `build`, `e2e`, and `retrieval-eval` before merge.

## Deferred to actual deployment (document now, build later)

The site isn't deployed yet, so there's no Vercel preview URL to run E2E against — for
now, `e2e` runs against a locally built-and-started server in the CI runner itself
(`npm run build && npm run start` in the background, then point Playwright at
`localhost:3000`), which is what Phase 05 already assumes.

**When the site does get deployed**, switch `e2e` to run against Vercel preview
deployments instead. Two known gotchas to leave as a comment in the workflow file now, so
they're not rediscovered the hard way later:

1. Trigger off the `deployment_status` GitHub event (cleanest — no polling needed) or use
   a wait-for-preview action; read the preview URL from
   `github.event.deployment_status.environment_url`.
2. **Vercel preview URLs are auth-gated by default** (Deployment Protection). You'll need
   a "Protection Bypass for Automation" secret from the Vercel project settings, sent as
   **both** the `x-vercel-protection-bypass` header **and** `x-vercel-set-bypass-cookie: true`.
   Skipping the cookie header means only the very first request in each test actually
   bypasses the login wall — every subsequent in-browser navigation during that same test
   will hang on the protection challenge. This is a well-documented gotcha; don't rediscover
   it by debugging a mysteriously hanging E2E suite after deployment.

## Verification

- Push a branch containing this workflow file (and whatever phase scripts are already
  landed) and confirm the Actions run triggers and completes.
- `quality`, `build`, and `e2e` (and `retrieval-eval` if Phase 07 has landed) all go
  green.
- Deliberately introduce a type error, a lint error, and a failing test on a throwaway
  branch one at a time, and confirm each correctly fails the `quality` job (i.e. the job
  isn't accidentally swallowing failures).
- If the `db` job is wired up, confirm it runs (even if non-blocking) and doesn't hang
  indefinitely waiting on Docker.

## Commit

One commit for this phase, e.g.:
`ci: add GitHub Actions workflow for lint, typecheck, tests, build, and E2E`
