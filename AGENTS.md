# AGENTS.md

Instructions for AI coding agents (Cursor, Claude Code, etc.) working in this repo.

## What this is

A single-owner AI-powered portfolio site. **Foster** is the only "owner" account (gated by
the `OWNER_EMAIL` env var), even though the database schema looks multi-tenant (`owner_id`
columns everywhere — see "Critical facts" below). Public visitors can read an AI-generated
About page, chat with a RAG-powered assistant, get an AI job-fit analysis, view anonymized
peer feedback, and submit peer feedback via a tokenized link. The owner logs in to
`/dashboard` to manage content, prompts, files, and feedback.

Stack: Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, Supabase
(Postgres + pgvector, Auth, Storage), Google Gemini.

## Setup

```
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

Full env var reference and known setup gotchas: `docs/dev-setup.md`.

## Verification

Run these before considering a change done:

```
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` runs the unit/route/component suites offline — Supabase and Gemini are mocked,
no network or Docker required. Heavier checks, not run by default:

- `npm run test:e2e` — Playwright, needs `npm run build` first
- `npm run test:db` — needs `npx supabase start` (local Postgres via Docker)
- `npm run test:coverage`
- `npm run test:eval` is a stub, not implemented yet — ignore it

The `check` skill/command runs the first four in order and stops on the first failure.

## Testing rule

New or changed code needs a test in the mirrored location:

- `lib/**/*.ts` → `tests/unit/lib/**` (e.g. `lib/feedback/tokens.ts` → `tests/unit/lib/feedback/tokens.test.ts`)
- `components/**` or `app/**` (pages/components) → `tests/components/**`
- `app/api/**/route.ts` → `tests/api/**` (e.g. `app/api/data/route.ts` → `tests/api/data.test.ts`)
- `middleware.ts` → `tests/api/middleware.test.ts`
- `supabase/migrations/**/*.sql` (schema/RLS/function changes) → a pgTAP test in `supabase/tests/*.sql`, verified with `npm run test:db`
- A new full user-facing workflow (spans multiple pages/routes) → a Playwright spec in `tests/e2e/*.spec.ts`. Small tweaks to an existing flow just update its existing spec.
- Any bug fix, anywhere → a regression test that fails before the fix and passes after.

Full detail and mocking conventions: `.claude/rules/testing.md` (loads automatically when
touching matching files).

## Critical facts

- **Single-owner assumption**: every table has an `owner_id` column and RLS keyed on it,
  but the app only ever supports one owner, resolved via `OWNER_EMAIL`/`isOwner()`. See
  `docs/architecture.md#single-owner-assumption`.
- **Admin-client bypass**: `lib/supabase/admin.ts` uses the service-role key and bypasses
  RLS entirely. Any route using it is fully responsible for its own authorization in code —
  RLS won't save you there. See `docs/auth-and-security.md`.
- **Every owner-only API route independently re-checks auth.** Middleware only refreshes
  the session cookie and gates nothing; `dashboard/layout.tsx` only gates page navigation,
  not raw API calls. Every owner-only route handler starts with:
  ```ts
  const user = await getUser();
  if (!user || !isOwner(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ```
- **The 2-responder floor**: any code path that surfaces feedback data must require
  `responder_count >= 2` before returning anything — no DB constraint enforces this. See
  `docs/data-model.md`.
- **`middleware.ts`'s rate-limit headers are informational only.** Nothing actually rejects
  requests for exceeding them. Don't treat this as real rate limiting, and don't "fix" it as
  if it were broken.
- **`npm run export` / `npm run deploy` are broken**, leftover `create-next-app` scripts —
  `next export` can't work with this app's API routes and middleware. Deploy via
  `next build` + `next start`, or Vercel.

## Docs map

| Doc | Read this for |
|---|---|
| `docs/architecture.md` | Tech stack, folder layout, request flows, single-owner assumption |
| `docs/dev-setup.md` | Local env setup, required env vars, known-broken scripts |
| `docs/data-model.md` | Every table, RLS, the schema gaps in `supabase/migrations/` |
| `docs/api-reference.md` | Every API route: method, auth, request/response shape |
| `docs/auth-and-security.md` | Login/authorization model, RLS vs. admin-client bypass |
| `docs/ai-pipeline.md` | RAG chat, embeddings, About-page gen, job comparison, feedback analysis |
| `docs/frontend.md` | Route map, page behavior, shared components, styling conventions |

## Keeping docs in sync

A change to routes, schema, auth, or the AI pipeline must update the matching doc in the
same change: `api-reference.md` for routes, `data-model.md` for schema,
`auth-and-security.md` for auth, `ai-pipeline.md` for Gemini/RAG. There's no codegen here —
these hand-written docs are the only thing keeping future agents from re-deriving (or
misreading) behavior from scratch.
