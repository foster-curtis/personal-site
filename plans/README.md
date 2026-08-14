# Test Suite & QA Foundation — Plan Index

This folder breaks one larger plan ("build a test suite, CI, and QA foundation for
`personal-site` from zero") into 10 independent phase files. Each phase file is written
to be handed to a fresh agent or session with **no memory of how this plan was produced**
— it restates what it needs from this README inline, so read the phase file first and
come back here only if something is unclear or you need the full rationale.

Read this file once if you're picking up **any** phase — it has the context, decisions,
and bug list every phase file assumes.

## Project context

`personal-site` (GitHub: `foster-curtis/personal-site`, **not yet deployed**) is an
AI-powered interactive resume: visitors chat with a RAG-backed assistant grounded in
Foster's real experience, recruiters paste job descriptions for an AI fit analysis, and
former colleagues submit anonymous peer feedback that an LLM summarizes back into the
public chat.

**Stack:** Next.js 16.1.4 (App Router), React 19.2, TypeScript (strict), Tailwind 4,
Supabase (Postgres + pgvector, `@supabase/ssr`), Google Gemini (`gemini-2.5-flash` +
`text-embedding-004` via `@google/generative-ai`), PostHog analytics. `tsconfig.json` uses
`moduleResolution: "bundler"` and the path alias `@/* → ./*`. `package.json` has no
`"type"` field; the project already uses `.mjs` config files (`eslint.config.mjs`,
`postcss.config.mjs`).

**Current state:** zero tests, no test runner, no test config, no CI, and
**`node_modules` is not installed** — `npm install` is step zero of Phase 0. Node 26 /
npm 11 are available locally; CI should target Node 22 (see Phase 08).

Three things make testing unusually valuable here rather than merely virtuous:

1. **Public endpoints accept untrusted input.** `/api/feedback/submit`, `/api/chat`,
   `/api/job-compare`, `/api/feedback/form/[token]`, and `/api/owner/resume` are all
   unauthenticated, and three of them use the **service-role admin client that bypasses
   RLS**.
2. **The RAG pipeline degrades silently.** If chunking, the 0.3 similarity threshold, or
   chunk prioritization breaks, nothing throws — the assistant just quietly gives worse
   answers. Only a test or an eval catches that class of failure.
3. **Non-determinism needs a boundary.** Gemini calls must be stubbed for tests to mean
   anything, which forces a clean seam between orchestration and model.

## Blocking discovery: the database schema is not in source control

The code reads 10 tables and 1 Postgres function. `supabase/migrations/` only covers six:

| Object | Uses in code | Versioned? |
|---|---|---|
| `content_blocks` | 23 | ❌ only an `ALTER` in `004` |
| `prompts` | 9 | ❌ |
| `files` | 5 | ❌ |
| `content_embeddings` | 4 | ❌ |
| `match_embeddings()` RPC | 1 | ❌ **no definition anywhere in repo** |
| pgvector extension | — | ❌ |
| `owner-files` storage bucket | — | ❌ |
| `feedback_*` (4 tables) | 28 | ✅ `002`, `003` |
| `about_cache` | 3 | ✅ `001` |

Four core tables, the vector extension, the similarity-search function, and the storage
bucket exist **only inside the hosted Supabase project**. This blocks any real-database
testing and independently means the project can't be rebuilt from source. **Phase 00
fixes this — it is the single highest-priority phase in the whole plan.**

## Bugs already found while mapping (verified by reading, not yet by a test)

These become the first regression tests for whichever phase touches that file, rather
than a separate cleanup effort:

- **`app/api/about/route.ts:31`** — `cached:` compares a full ISO timestamp to a
  `YYYY-MM-DD` string, so the cache-hit log flag is **always `true`**.
- **`lib/about.ts:41`** — `.from("auth.users")` can't work through PostgREST, so that
  branch always fails and the `content_blocks` fallback (`:54`) is the only live path.
  That fallback grabs the **first row's `owner_id` regardless of `OWNER_EMAIL`**.
  `lib/rag.ts:171` repeats the same pattern.
- **`app/api/feedback/submit/route.ts`** — checks `link.expires_at` but never
  `feedbackRequest.expires_at`, while `feedback/form/[token]/route.ts:77` *does*. An
  expired feedback request still accepts submissions.
- **`app/api/feedback/submit/route.ts:179`** — `submission_count` is read-then-written
  (not atomic), so concurrent submissions can exceed `max_submissions`.
- **`lib/gemini/client.ts:121`** (`chunkText`) — a single word longer than
  `maxChunkLength` is emitted as an over-length chunk; `currentChunk` also leaks across
  sentence iterations.
- **`lib/llm.ts:73`** (`generateJSON`) — the markdown fence stripper misses uppercase
  ` ```JSON ` and any prose preceding the fence.
- **`app/api/data/[id]/route.ts:134`** — `DELETE` on a nonexistent id returns `200`
  instead of `404`.
- **Token length inconsistency** — `validateFeedbackSubmission` (lib/validation.ts)
  accepts tokens ≥20 chars, `isValidTokenFormat` (lib/feedback/tokens.ts) requires ≥32,
  real generated tokens are 43.
- **Dead exports** with zero call sites anywhere in the repo: `logger.timed`
  (lib/logging.ts), `isValidTokenFormat` (lib/feedback/tokens.ts), `getOwnerDisplayName`
  (lib/feedback/questions.ts), `getBlockTitles` (lib/rag.ts), `embedTexts`
  (lib/gemini/client.ts), and the `ownerEmail` variable in `app/(auth)/login/page.tsx:56`.

## Decisions already made (don't re-litigate these)

- **Scope:** pragmatic core — unit tests on pure logic, integration tests on route
  handlers with mocked I/O, a thin E2E smoke suite. Not exhaustive coverage on day one.
- **Test runner: Vitest** (not Jest). Confirmed against the official Next.js testing docs
  (<https://nextjs.org/docs/app/guides/testing>), which document four supported runners
  with no single recommendation — the choice here is driven by this repo's `bundler`
  module resolution and existing `.mjs`-config convention. Full rationale in Phase 01.
- **Database:** hybrid. Mocked by default so the main suite is fast and offline; a
  separate opt-in suite runs against a real local Supabase stack via the Supabase CLI +
  Docker (confirmed available).
- **LLM:** all Gemini calls mocked in the main suite. A separate opt-in eval suite (not
  "tests" — see Phase 07) makes real calls, run manually or on a schedule, never
  per-commit.
- **CI:** build the GitHub Actions workflow as part of this work, not deferred.
- **Also wanted:** error monitoring, dependency automation, secrets/env safety — covered
  in Phase 09.
- **Not deployed yet** — CI is built now; deployment-specific gates (e.g. E2E against
  Vercel previews) are documented for later rather than built now, since there's nothing
  to point them at yet.

## Phase index and dependency order

| Phase | File | Depends on | Can start independently once deps are met? |
|---|---|---|---|
| 0 | [00-prerequisites.md](00-prerequisites.md) | nothing | ✅ — do this first, always |
| 1 | [01-test-runner-foundation.md](01-test-runner-foundation.md) | Phase 0 | ✅ |
| 2 | [02-unit-tests.md](02-unit-tests.md) | Phase 1 | ✅ |
| 3 | [03-route-handler-tests.md](03-route-handler-tests.md) | Phase 1 | ✅ (parallel with 2) |
| 4 | [04-component-tests.md](04-component-tests.md) | Phase 1 | ✅ (parallel with 2, 3) |
| 5 | [05-e2e-smoke-suite.md](05-e2e-smoke-suite.md) | Phase 1 (app must build) | ✅ (parallel with 2–4) |
| 6 | [06-db-integration.md](06-db-integration.md) | Phase 0 (schema capture) + Phase 1 | ✅ (parallel with 2–5) |
| 7 | [07-rag-evals.md](07-rag-evals.md) | Phase 1 | ✅ (parallel with 2–6) |
| 8 | [08-ci-pipeline.md](08-ci-pipeline.md) | Phases 1–7 ideally landed, but can scaffold early and comment out missing jobs | do last, or iteratively |
| 9 | [09-devops-recommendations.md](09-devops-recommendations.md) | Phase 0.3 for the env-validation item; rest independent | ✅ (parallel with everything) |

Phases 2 through 7 only share Phase 1's runner config — they can genuinely be worked in
parallel by different agents once Phase 1 lands. Phase 8 is the integration point and
should be picked up last, or iteratively re-run as each other phase completes.

## Workflow for every phase

1. Read the phase file fully before starting.
2. Do the work described.
3. Run that phase's own **Verification** section. Fix anything red.
4. Make **one git commit** covering just that phase's changes before stopping. Use a
   commit message describing the phase (e.g. `test: add Vitest runner foundation`).
5. If you discover the phase's assumptions were wrong (e.g. a dependency phase wasn't
   actually done), say so rather than working around it silently.

## Full end-to-end verification (after all phases land)

1. `npm install && npm run typecheck && npm run lint` — clean.
2. `npm test` — passes offline with no `.env`, no Docker, no network.
3. `npm run test:coverage` — high coverage on `lib/` pure modules and route handler error
   paths; low coverage on components/pages is expected and fine.
4. `npx supabase start && npm run test:db` — RLS isolation and `match_embeddings`
   verified against real Postgres.
5. `npm run build && npm run test:e2e` — smoke suite green against a production build.
6. `npm run test:eval` with real Gemini credentials — recall@5 and schema conformance
   reported.
7. Push a branch and confirm the GitHub Actions run goes green end to end.

**Definition of done:** every bug listed above has a test that fails before any
accompanying fix and passes after; `npm test` is green fully offline; CI is green on a
pushed branch.
