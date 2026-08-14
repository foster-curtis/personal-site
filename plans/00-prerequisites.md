# Phase 00 — Prerequisites

**Depends on:** nothing. Do this phase first, always — every other phase assumes it's done.

## Context

`personal-site` is a Next.js 16.1.4 / React 19.2 / TypeScript AI-powered interactive
resume (Supabase + Google Gemini) that currently has zero tests, no CI, and
**`node_modules` isn't even installed**. This phase is step zero of a 10-phase plan to
build a test suite and CI/CD from scratch. Full project context, the complete discovered-
bug list, and all cross-phase decisions live in [README.md](README.md) — skim it if
anything below is unclear, but this file is self-contained for the work itself.

This phase has three unrelated but equally blocking pieces. Do all three; they don't
depend on each other.

## Task 0.1 — Install dependencies

Run `npm install` at the repo root. Nothing else in this plan can run without it.

## Task 0.2 — Capture the missing database schema (highest-priority item in this phase)

The application code queries 10 Supabase tables and 1 Postgres RPC function, but
`supabase/migrations/` only defines 6 tables (`about_cache` in `001`, four
`feedback_*` tables in `002`/`003`, plus an `ALTER` on `content_blocks` in `004`). Four
core tables, the pgvector extension, the `match_embeddings()` similarity-search function,
and the `owner-files` storage bucket exist **only inside the hosted Supabase project** —
there is no source-of-truth for them in this repo.

Missing objects (inferred from `lib/db/types.ts` and query call sites — verify against
the live project, don't just trust this list):
- `content_blocks` table: `id, owner_id, type ("resume"|"story"|"qa"|"file_metadata"), title, body_text, source_question_id, is_important, created_at, updated_at`
- `content_embeddings` table: `id, content_block_id, chunk_index, chunk_text, embedding (vector, 768 dims — text-embedding-004), created_at`
- `prompts` table: `id, owner_id, prompt_text, status ("pending"|"answered"), answer_block_id, created_at, answered_at`
- `files` table: `id, owner_id, content_block_id, name, storage_path, mime_type, size_bytes, created_at`
- `match_embeddings(query_embedding, match_threshold, match_count)` RPC — the only call
  site is `lib/rag.ts:20`; it's expected to return rows shaped like `EmbeddingMatch` in
  `lib/db/types.ts:42` (`id, content_block_id, chunk_index, chunk_text, similarity`). This
  signature is currently **unverifiable from source** — you must pull it from the live
  project to know it for certain.
- `owner-files` storage bucket, referenced in `app/api/files/route.ts` and
  `app/api/files/[id]/route.ts` (signed URLs, upload/delete).

Steps:
1. `npx supabase login && npx supabase link --project-ref <ref>` (the project ref is in
   the Supabase dashboard URL for this project; ask the user if you don't have it).
2. `npx supabase db pull` to generate a migration capturing the live schema as it
   actually exists today.
3. Split the pulled result into clean, reviewable migrations rather than one dump:
   - `005_content_core.sql` — pgvector extension enable, `content_blocks`,
     `content_embeddings`, `prompts`, `files`, their indexes, and their RLS policies.
   - `006_match_embeddings.sql` — the `match_embeddings()` function definition.
   - `007_storage_bucket.sql` — `owner-files` bucket provisioning and its storage
     policies.
4. Confirm `match_embeddings`'s real signature and return shape match the
   `EmbeddingMatch` TypeScript type. If they don't match exactly, flag the mismatch —
   don't silently "fix" the TypeScript types or the SQL without surfacing it.
5. Note on ordering: the pulled `content_blocks` will already include the
   `is_important` column, so migration `004` becomes a historical no-op. That's fine —
   it's `ADD COLUMN IF NOT EXISTS`-guarded, so leave it in place rather than deleting
   history.

This phase unblocks [06-db-integration.md](06-db-integration.md) entirely — that phase
cannot start without this one, since there is currently nothing to migrate a local
Postgres instance into.

## Task 0.3 — Env safety

There is currently **no `.env.example`** in the repo (`.gitignore` ignores all `.env*`
files), so there's no documented list of what env vars a fresh clone needs.

1. Create `.env.example` at the repo root documenting all 11 variables the codebase
   reads, with placeholder values and a one-line comment on each:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` (server-only, bypasses RLS — mark it clearly sensitive)
   - `GEMINI_API_KEY`, `GEMINI_MODEL` (optional, defaults to `gemini-2.5-flash`)
   - `OWNER_EMAIL` (server-only; gates every owner-only route via `lib/auth.ts::isOwner`),
     `OWNER_NAME` (optional display name, server-side)
   - `NEXT_PUBLIC_OWNER_NAME` (client-side display name)
   - `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (optional, defaults to
     `https://us.i.posthog.com`)
   - **Do not** include `NEXT_PUBLIC_OWNER_EMAIL` — it's read once in
     `app/(auth)/login/page.tsx:56` and assigned to a variable that's never used; it's
     dead code, not a real requirement.
2. Add `lib/env.ts` that validates the required **server-side** vars
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OWNER_EMAIL`) at module load time and
   throws a single readable error listing everything missing, e.g.
   `Missing required environment variables: GEMINI_API_KEY, OWNER_EMAIL`. This replaces
   the scattered ad-hoc checks currently duplicated in
   `lib/supabase/admin.ts:12` (throws on missing URL/service key) and
   `lib/gemini/client.ts:5` (throws on missing API key) — those can call into the shared
   validator instead of re-implementing the check, or you can leave them as redundant
   defense-in-depth and just add the new centralized check as what runs first. Use your
   judgment; don't do a large refactor here, just make sure a missing var fails loudly
   and early rather than as a confusing 500 on someone's first chat message.

## Verification

- `npm install` completes without errors; `node_modules/` exists.
- `npx supabase db diff` (or equivalent) shows no drift between the new migrations and
  the live project — i.e. the migrations actually capture what's live.
- A fresh clone with `.env.example` copied to `.env.local` and real values filled in
  should be able to run `npm run dev` successfully.
- Deliberately unset one required var (e.g. `GEMINI_API_KEY`) and confirm the app fails
  fast with a clear error rather than a confusing runtime crash deep in a request handler.

## Commit

One commit for this phase, e.g.:
`chore: capture Supabase schema in migrations, add env validation and .env.example`
