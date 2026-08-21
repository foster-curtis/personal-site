# Dev Setup & Workflow

## Prerequisites

- Node.js (version matching `@types/node ^20` in `package.json` — Node 20+ recommended)
- A Supabase project (Postgres + Auth + Storage), with:
  - The `pgvector` extension enabled
  - The base schema created (see below — **this is not optional and not
    automated**)
  - A Storage bucket named `owner-files`
- A Google Gemini API key

## ⚠️ Standing up a fresh database

`supabase/migrations/` is **not sufficient on its own**. It only contains
four incremental migrations starting from `about_cache`, assuming
`content_blocks` and other base tables already exist. Before running the
migrations, you must first create by hand:

- `content_blocks`, `content_embeddings`, `prompts`, `files` tables
  (column definitions reconstructed in [data-model.md](./data-model.md))
- The `match_embeddings` Postgres function (cosine similarity search over
  `content_embeddings.embedding`, called with `query_embedding`,
  `match_threshold`, `match_count`)
- Row Level Security policies on those tables (owner-scoped, following the
  same `auth.uid() = owner_id` pattern the later migrations use)
- The `owner-files` Storage bucket

Then apply `supabase/migrations/001` through `004` in order via the
Supabase SQL editor or CLI. See
[data-model.md](./data-model.md#-the-migrations-folder-is-not-a-full-schema)
for why this gap exists.

## Environment variables

Copy [`.env.example`](../.env.example) (repo root) to `.env.local` and fill
in real values. Full reference:

| Variable | Required | Client-exposed? | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **yes** | yes | Supabase project URL. Used with a non-null assertion (`!`) in `lib/supabase/*` and `middleware.ts` — missing it throws at request time, on nearly every route, since middleware runs almost everywhere. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **yes** | yes | Supabase anon key, same failure mode as above |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes**, for any public/admin route | no | Powers `createAdminClient()` — required for chat, about, job-compare, feedback public routes, embedding sync. Treat as a secret with full DB access. |
| `GEMINI_API_KEY` | **yes**, for any AI feature | no | Throws (at call time, not startup) if unset when an LLM call is attempted |
| `GEMINI_MODEL` | no (default `gemini-2.5-flash`) | no | Generation model only — embeddings are hardcoded to `gemini-embedding-001` (truncated to 768 dims via `outputDimensionality`) regardless of this var |
| `OWNER_EMAIL` | **yes** | no | The single account treated as the owner (`isOwner()`). Also used to resolve "the owner" user id in `job-compare` and `owner/resume` routes. |
| `OWNER_NAME` | no | no | Display name fallback in About-page and feedback-analysis prompts. Different call sites default differently (`"Foster Curtis"` in About, `"the candidate"` in feedback analysis) if unset. |
| `NEXT_PUBLIC_OWNER_NAME` | no | yes | Display name fallback used client-side (references page, feedback form, `getOwnerDisplayName()`). Keep in sync with `OWNER_NAME` — they're two separate vars for the same concept, one server- one client-readable. |
| `NEXT_PUBLIC_OWNER_EMAIL` | no | yes | Read in `login/page.tsx` but **unused dead code** — safe to leave unset |
| `NEXT_PUBLIC_POSTHOG_KEY` | no | yes | Analytics is fully disabled (no-op, no client init) if unset |
| `NEXT_PUBLIC_POSTHOG_HOST` | no (default `https://us.i.posthog.com`) | yes | |

## Scripts (`package.json`)

| Script | Use it? |
|---|---|
| `npm run dev` | Yes — local dev server |
| `npm run build` | Yes — production build |
| `npm run start` | Yes — serve the production build |
| `npm run lint` | Yes — ESLint (`eslint-config-next`, core-web-vitals + typescript configs) |
| `npm run export` | **No.** Runs `next export`, which requires a fully static site. This app uses API routes and middleware (dynamic by definition) — this script will not produce a usable build. Leftover `create-next-app` scaffolding. |
| `npm run deploy` | **No**, same reason — it's `build && export`. |

Deploy via `next build` + `next start` on a Node host, or a platform with
native Next.js App Router support (e.g. Vercel) — not via static export.

The `ghpages` devDependency is unused by any script and appears to be
another scaffolding leftover.

## Linting

`eslint.config.mjs` extends `eslint-config-next`'s `core-web-vitals` and
`typescript` configs with no project-specific rule overrides beyond the
default ignore list (`.next/**`, `out/**`, `build/**`, `next-env.d.ts`).
`.hintrc` configures `webhint` (`extends: ["development"]`, with
`axe/forms.select-name` turned off) — this is a separate tool from ESLint,
likely IDE- or CI-integrated rather than run via an npm script (there's no
`hint` script in `package.json`).

## No test suite

There is no test runner configured (no Jest/Vitest/Playwright in
`package.json`). Manual verification against a running dev server plus
`npm run lint` and `tsc`'s type checking (via `next build`, since `noEmit`
is set in `tsconfig.json`) are the only automated checks available today.
