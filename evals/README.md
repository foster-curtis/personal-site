# RAG / LLM evals

Opt-in quality evals for the RAG chat pipeline, job-fit analysis, and peer-feedback
analysis — separate from `tests/` on purpose. Tests assert correctness and must never
flake; evals measure quality against real Gemini (and, for one category, a real Supabase
project) and are expected to fluctuate run-to-run. **Never wired into `npm test`** — run
explicitly via `npm run test:eval`, manually or on a schedule (see "CI" below).

Two rules enforced throughout this directory (see plans/07-rag-evals.md for the reasoning):

1. Never snapshot-test raw LLM output. Every scorer here asserts structure, schema, or a
   graded score — never text equality.
2. Never grade on a single sample. Generation-based evals set `trialCount: 3` (an evalite
   built-in that reruns each input N times); `report-stats.mjs` turns that into mean ±
   stddev per scorer instead of the single averaged number evalite's own CLI table shows.

## Setup

1. Populate `.env.local` at the repo root with **real** credentials (`GEMINI_API_KEY`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`) — see docs/dev-setup.md. `evals/setup/env.ts`
   loads this file and refuses to run against the fake sentinel values
   `tests/setup/env.ts` uses for the mocked suite.
2. **retrieval-quality** and **answer-grounding** additionally need a **local** Supabase
   project (`supabase start`, see plans/06-db-integration.md) pointed at by
   `NEXT_PUBLIC_SUPABASE_URL`. They write and delete a fixture knowledge base
   (`fixtures/knowledge-base.ts`) under the real `OWNER_EMAIL` account, and
   `match_embeddings()` has no owner scoping (see docs/data-model.md) — seeding fixture
   content against the hosted project would mix synthetic data into the real chat
   assistant's retrieval results. `helpers/local-db-guard.ts` refuses to run against a
   non-local URL unless `EVAL_ALLOW_REMOTE_SEED=true` is set.
3. **schema-conformance** and **prompt-injection-resistance** are read-only (or don't touch
   the DB at all) and can target any project with real owner content — including the
   hosted one.

## Running

```bash
npm run test:eval
```

Runs all four `*.eval.ts` files once, writes `evals/results/latest.json`, and prints a
mean/stddev summary. Commit `latest.json` after a real run so quality drift is visible in
git history (see `results/README.md`).

To run one category, or use evalite's local review UI:

```bash
cd evals
npx evalite run retrieval-quality.eval.ts   # one file, single run
npx evalite watch                            # local UI, reruns on save
```

`evals/` has its own `vite.config.mts` and `evalite.config.mts`, deliberately separate from
the repo-root `vitest.config.mts`. That file's `test.projects` setup makes Vitest ignore any
include/exclude evalite passes in programmatically — running evalite against the root config
silently runs the entire mocked test suite instead of these eval files. `npm run test:eval`
always `cd`s into `evals/` first so this directory's own config is what gets picked up.

### Known gotcha: `better-sqlite3` native build

evalite's default result storage is SQLite (`better-sqlite3`), which needs a native build if
no prebuilt binary matches your platform/Node version — that needs a working Python 3 +
build-tools setup for `node-gyp`. That failed in the environment this phase was built in
(no prebuilt binary for that Node version on Windows, no Python toolchain), so
`evals/evalite.config.mts` defaults to evalite's zero-native-deps **in-memory** storage
backend instead — `npm run test:eval` (one-shot `evalite run`) works fine with it; the only
cost is `evalite watch`'s cross-run history in its local review UI. If you've got a working
Python 3 + build-tools setup and want that UI, swap to the SQLite backend documented inline
in that file.

### Known gotcha: `autoevals` version

`autoevals@0.3.0` (latest on npm) sets `"engines": {"npm": "please-use-pnpm"}`, so plain
`npm install` silently falls back to the newest version without that restriction
(`0.0.132`, pinned in package.json). Functionally equivalent for what this suite uses
(`Factuality`); revisit if this repo ever migrates off npm.

## The four categories

| File | Category | Tier | Needs |
|---|---|---|---|
| `retrieval-quality.eval.ts` | recall@5 over a 36-question golden set | blocking-eligible | local Supabase (writes fixtures) |
| `answer-grounding.eval.ts` | model declines when context is missing | nightly, non-blocking (judged) | local Supabase (writes fixtures) |
| `schema-conformance.eval.ts` | `/api/job-compare` output validates its schema | blocking-eligible | any project with real owner content |
| `prompt-injection-resistance.eval.ts` | feedback analysis + job-compare resist canary-leak injection | nightly, non-blocking (judged) | any project (feedback path touches no DB; job-compare path is read-only) |

`answer-grounding` and `prompt-injection-resistance` are judged by an LLM
(`autoevals`'s `Factuality`, or a schema+canary check backed by a real model call) —
routed to Gemini's OpenAI-compatible endpoint rather than requiring a second provider
credential (see `helpers/gemini-openai-client.ts`).

## CI (note for whoever picks up Phase 08)

Only **retrieval-quality** and **schema-conformance** are reasonable *blocking* CI checks —
cheap (no generation call) or deterministic-enough (schema validation) not to introduce
flakiness into a required check. Run either alone with a hard gate via evalite's own
`--threshold` flag, e.g. from within `evals/`:

```bash
evalite run retrieval-quality.eval.ts --threshold 80
evalite run schema-conformance.eval.ts --threshold 100
```

`answer-grounding` and `prompt-injection-resistance` are judged/probabilistic and belong on
a nightly cron, non-blocking. This is a note, not a built CI job — wiring it up is Phase
08's scope.
