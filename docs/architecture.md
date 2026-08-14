# Architecture

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript (strict mode) |
| Styling | Tailwind CSS 4 (via `@tailwindcss/postcss`), no component library |
| Auth | Supabase Auth (email/password), cookie-based sessions via `@supabase/ssr` |
| Database | Supabase Postgres, with `pgvector` for embeddings |
| File storage | Supabase Storage (bucket `owner-files`) |
| LLM / embeddings | Google Gemini (`@google/generative-ai`), see [ai-pipeline.md](./ai-pipeline.md) |
| Analytics | PostHog (`posthog-js`), client-side only, opt-in via env var |
| Markdown/LaTeX rendering | `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` (chat assistant messages only) |

There is a Vitest (unit/component/route) + Playwright (e2e) test suite and a pgTAP suite
for RLS/schema (`supabase/tests/`), but no CI config yet and no ORM — all database access
goes through the Supabase JS client with hand-written `.select()`/`.insert()` chains and
manually maintained TypeScript types in `lib/db/types.ts`. See `AGENTS.md`'s testing rule
and `.claude/rules/testing.md` for where new tests go.

## Folder layout

```
app/
  (auth)/          # route group: login, OAuth/email callback, access-denied
  (public)/        # route group: about, chat, job-analysis, references, feedback/[token]
  api/              # Route Handlers — see api-reference.md
  dashboard/        # owner-only pages, gated by dashboard/layout.tsx
  layout.tsx        # root layout: fonts, <Header/>, <PostHogProvider/>
  page.tsx          # public landing page ("/")
components/
  chat/             # ChatMessage (markdown+KaTeX), PromptMarquee (scrolling suggestions)
  layout/Header.tsx # global nav, client-side session fetch
  PostHogProvider.tsx
lib/
  about.ts          # About-page generation + caching
  analytics.ts       # PostHog event helpers
  auth.ts             # getUser/getSession/isOwner
  chat/prompts.ts     # static suggested-prompt list for the chat marquee
  db/types.ts         # hand-written types mirroring the DB schema
  feedback/           # tokens, question config, AI analysis
  gemini/client.ts     # low-level Gemini SDK wrapper (generation + embeddings)
  llm.ts               # thin "provider-agnostic" wrapper around gemini/client.ts
  logging.ts            # structured JSON logger (used inconsistently — see below)
  rag.ts                # retrieval + prompt-building for the chat endpoint
  supabase/             # three client factories: browser, server (RLS), admin (bypasses RLS)
  validation.ts          # input validation/sanitization for public-facing endpoints
middleware.ts            # session refresh + security headers, runs on almost every request
supabase/migrations/      # SQL migrations — NOT a full schema, see data-model.md
```

The `(auth)` and `(public)` segments are Next.js **route groups** — they
don't appear in the URL. `/login`, `/chat`, `/about`, etc. are all
top-level paths.

## Request flow examples

**Public chat message** (`/chat` page → `POST /api/chat`):
1. `middleware.ts` refreshes the Supabase session cookie and adds
   security/rate-limit-hint headers (no session is required for this route).
2. `app/api/chat/route.ts` embeds the user's message, retrieves and
   prioritizes chunks via `lib/rag.ts`, optionally appends an anonymized
   peer-feedback summary, and calls Gemini via `lib/gemini/client.ts`.
3. Response is returned with `sources` (chunk titles + similarity) for
   transparency in the UI.

**Owner editing resume content** (`/dashboard/resume` → `POST /api/data`):
1. `dashboard/layout.tsx` (server component) already redirected away any
   non-owner before this page rendered.
2. The API route independently re-checks `getUser()` + `isOwner()` — this
   check is duplicated on every owner-only route, not just relied upon at
   the layout level.
3. On success, the page optionally fires `POST /api/embed` with the new
   `content_block_id` (fire-and-forget) to keep the vector index in sync.

## Single-owner assumption

Every table in the schema has an `owner_id` column and RLS policies keyed
on `auth.uid() = owner_id`, which *looks* multi-tenant. In practice, the
application only ever supports **one** content owner, identified by the
`OWNER_EMAIL` env var (see [auth-and-security.md](./auth-and-security.md)).

This shows up as a recurring pattern across `lib/rag.ts`, `lib/about.ts`,
and `lib/feedback/analysis.ts`: instead of resolving "the owner" from the
authenticated session, these public/admin-client code paths grab the
`owner_id` off the **first row** of `content_blocks`:

```ts
const { data: ownerBlocks } = await supabase
  .from("content_blocks")
  .select("owner_id")
  .limit(1);
const ownerId = ownerBlocks[0].owner_id;
```

Two other routes (`app/api/job-compare/route.ts`,
`app/api/owner/resume/route.ts`) instead resolve the owner via
`supabase.auth.admin.listUsers()` and match by `OWNER_EMAIL`. Both
approaches coexist; neither is wrong, but if you ever add a second content
author, all of these call sites need to be revisited — the app has no
concept of "which owner" beyond "the only one."

## The admin-client bypass pattern

`lib/supabase/admin.ts` creates a Supabase client using
`SUPABASE_SERVICE_ROLE_KEY`, which **bypasses Row Level Security
entirely**. It's used anywhere a route needs to read/write data without an
authenticated owner session:

- Public RAG retrieval (`lib/rag.ts`) — anonymous visitors querying content
- Public feedback form + anonymous submission (`app/api/feedback/form/[token]`, `app/api/feedback/submit`)
- Public feedback summary (`app/api/feedback/public-summary`)
- About-page generation/caching (`lib/about.ts`)
- Job comparison (`app/api/job-compare`)
- Public resume summary (`app/api/owner/resume`)
- Embedding writes inside `app/api/embed` (even for the owner-authenticated path)

Because RLS provides no protection on these paths, **all authorization and
privacy logic for admin-client routes lives in application code**. The most
important instance of this is the peer-feedback anonymity floor: both
`retrievePeerFeedbackSummary()` (lib/rag.ts) and `getPublicFeedbackSummary()`
(lib/feedback/analysis.ts) independently require `responder_count >= 2`
before returning anything, to prevent a single respondent's feedback from
being de-anonymized. If you add a new code path that surfaces feedback
data, it needs the same check — there's no database constraint enforcing it.

## Known rough edges (intentional to document, not necessarily to fix)

- `package.json` has `export`/`deploy` scripts (`next export`) left over
  from `create-next-app` scaffolding. This app uses API routes and
  middleware — `next export` requires a fully static site and will not
  produce a working build. Deploy via `next build` + `next start` (or
  Vercel), not these scripts. See [dev-setup.md](./dev-setup.md).
- `PROMPT_TEMPLATES` (the fallback self-interview questions) is duplicated
  verbatim in `app/api/prompts/generate/route.ts` and
  `app/api/prompts/refresh/route.ts` rather than shared from one module.
- `lib/logging.ts`'s structured logger is only used consistently in the
  feedback-submission and about-page routes; most other routes just use
  `console.error`/`console.log` directly.
- `NEXT_PUBLIC_OWNER_EMAIL` is read in `app/(auth)/login/page.tsx` but never
  actually used (the code comment even notes the client can't rely on it);
  it's dead code left from an earlier approach.
