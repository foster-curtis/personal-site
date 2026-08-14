# Data Model

Database: Supabase Postgres with the `pgvector` extension.
TypeScript types: [`lib/db/types.ts`](../lib/db/types.ts) — hand-maintained,
not generated, so keep it in sync manually when the schema changes.

## ⚠️ The migrations folder is not a full schema

`supabase/migrations/` only contains four incremental migrations
(`001`–`004`), starting from `about_cache`. The **base tables** —
`content_blocks`, `content_embeddings`, `prompts`, `files` — and the
`match_embeddings` RPC function and the `owner-files` Storage bucket are
**not defined anywhere in this repo**. They predate the migrations folder
and were created directly against the database (e.g. via Supabase Studio).

Practical implication: running every file in `supabase/migrations/` against
a fresh Supabase project will **not** produce a working database — several
migrations (`004_content_blocks_important.sql` in particular) `ALTER TABLE`
a table that was never `CREATE TABLE`'d in this repo. If you're standing up
a new environment, you need to recreate the base schema below by hand (or
export it from the existing project) before applying the migrations.

The column lists below for these "phantom" tables are reconstructed from
`lib/db/types.ts` and actual query usage across the codebase — treat them
as accurate for application purposes, but they are not backed by SQL you
can diff against.

## Tables

### `content_blocks` (schema not in repo — reconstructed)

The core content unit: resume entries, freeform stories, answered
self-interview prompts, and file metadata all live here.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid | FK to `auth.users`, see [single-owner assumption](./architecture.md#single-owner-assumption) |
| `type` | text | one of `resume`, `story`, `qa`, `file_metadata` |
| `title` | text | |
| `body_text` | text | the content that gets embedded/searched |
| `source_question_id` | uuid \| null | set when `type = 'qa'`, points at the `prompts` row it answers |
| `is_important` | boolean, default `false` | added in migration `004`; prioritizes this block's chunks in RAG retrieval (see [ai-pipeline.md](./ai-pipeline.md)). Resume blocks are set important by default on create (`app/api/data/route.ts`), and the `004` migration backfilled existing resume blocks to `true`. |
| `created_at` / `updated_at` | timestamptz | `updated_at` drives About-page cache invalidation |

Owner CRUD via `app/api/data/route.ts` and `app/api/data/[id]/route.ts`
(RLS-backed `createClient()`, scoped by `.eq("owner_id", user.id)` in every
query as defense in depth).

### `content_embeddings` (schema not in repo — reconstructed)

Chunked, embedded text for RAG retrieval.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `content_block_id` | uuid | FK to `content_blocks` |
| `chunk_index` | int | position within the block |
| `chunk_text` | text | |
| `embedding` | vector(768) | Gemini `text-embedding-004` output |
| `created_at` | timestamptz | |

Written/deleted exclusively via the admin client in `app/api/embed/route.ts`
(delete-then-reinsert per block on every sync — see
[ai-pipeline.md](./ai-pipeline.md)). Read via the `match_embeddings` RPC
function (also not in this repo — lives only in the live database),
called as:

```ts
supabase.rpc("match_embeddings", {
  query_embedding: number[], // 768-dim
  match_threshold: number,   // e.g. 0.3 (cosine similarity floor)
  match_count: number,       // e.g. 10
})
```
returning rows matching `EmbeddingMatch` (`id`, `content_block_id`,
`chunk_index`, `chunk_text`, `similarity`).

### `prompts` (schema not in repo — reconstructed)

Self-interview questions shown to the owner in `/dashboard/prompts`, used
to progressively grow their content.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid | |
| `prompt_text` | text | |
| `status` | text | `pending` \| `answered` |
| `answer_block_id` | uuid \| null | set on answer, points at the created `content_blocks` row (`type = 'qa'`) |
| `created_at` / `answered_at` | timestamptz | |

### `files` (schema not in repo — reconstructed)

Metadata for files uploaded to the `owner-files` Storage bucket.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid | |
| `content_block_id` | uuid \| null | not currently populated by any route — reserved for linking a file to a content block |
| `name` | text | original filename |
| `storage_path` | text | `{owner_id}/{timestamp}_{sanitized_name}` in the `owner-files` bucket |
| `mime_type` | text | restricted at upload time to `application/pdf`, `image/png`, `image/jpeg`, `image/gif`, `text/plain` |
| `size_bytes` | int \| null | 50MB max enforced in `app/api/files/route.ts` |
| `created_at` | timestamptz | |

### `about_cache` (`001_about_cache.sql`)

Caches the AI-generated About-page summary so it isn't regenerated on every
page view.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid | FK `auth.users`, cascade delete |
| `summary_json` | jsonb | `{ summary, headline, highlights[], skills[], interests[] }` |
| `content_updated_at` | timestamptz | snapshot of the newest `content_blocks.updated_at` (resume/story) at generation time — compared against current content to decide cache validity |
| `generated_at` | timestamptz | |
| `created_at` | timestamptz | |

**RLS:** service-role only (`USING (true) WITH CHECK (true)`, effectively
meaning only the admin client — which bypasses RLS anyway — should touch
this table; the permissive policy is there for schema completeness, not as
an active gate).

### `feedback_requests` (`002_feedback_tables.sql`)

An owner-created feedback campaign (e.g. "General feedback, 2026 job
search").

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid | FK `auth.users`, cascade delete |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz \| null | |
| `title` / `notes` | text \| null | |
| `is_active` | boolean, default `true` | |

**RLS:** owner full CRUD via `auth.uid() = owner_id`.

### `feedback_links` (`002_feedback_tables.sql`)

Shareable token URL for a request. One request currently gets exactly one
link (created inline in `POST /api/feedback/requests`), though the schema
allows more.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `request_id` | uuid | FK `feedback_requests`, cascade delete |
| `token` | text, unique | base64url, 32 random bytes (`lib/feedback/tokens.ts`) — no PII, safe to put in a URL |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz \| null | |
| `max_submissions` | int \| null, default `1` | |
| `submission_count` | int, default `0` | incremented in `app/api/feedback/submit/route.ts` after each successful submission |

**RLS:** owner manage, via join to `feedback_requests`.

### `feedback_responders` (`002_feedback_tables.sql`)

Anonymous correlation handle — **no PII stored, not even IP**. One row is
created per submission today (see note below).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `request_id` | uuid | FK `feedback_requests`, cascade delete |
| `link_id` | uuid | FK `feedback_links`, cascade delete |
| `created_at` | timestamptz | |

**RLS:** owner read-only (no update/delete policy — these rows are
immutable from the owner's perspective).

> **Note:** the table is designed to let one responder submit multiple
> responses over time (e.g. updates), but `POST /api/feedback/submit`
> currently creates a **new** `feedback_responders` row on every
> submission rather than reusing one for a returning respondent. The
> comment in that route acknowledges this ("For simplicity, we'll create a
> new responder for each submission"). `responder_count` in stats is
> therefore an upper bound on unique people, not an exact one, if a link
> allows more than one submission.

### `feedback_responses` (`002_feedback_tables.sql`)

One row per form submission.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `responder_id` | uuid | FK `feedback_responders`, cascade delete |
| `request_id` | uuid | FK `feedback_requests`, cascade delete (denormalized for query convenience) |
| `created_at` | timestamptz | |
| `metadata` | jsonb, default `{}` | relationship, worked_from/to — see `lib/feedback/questions.ts` |
| `content` | jsonb, default `{}` | free-text answers keyed by question id |
| `sentiment_score` | numeric \| null | set by AI analysis (1–10 scale), null until analyzed |
| `is_flagged` | boolean, default `false` | set by AI analysis for abusive/spam/extreme-negative content |
| `flag_reason` | text \| null | |

**RLS:** owner select/update/delete via join to `feedback_requests`.
Inserts only happen through the admin client (anonymous submission flow) —
there is no RLS insert policy for `anon`/`authenticated` roles.

### `feedback_summaries` (`003_feedback_summaries.sql`)

AI-generated aggregate summary per feedback request. One row per analysis
run (history is preserved; `/api/feedback/analysis/[requestId]` always
reads the most recent by `created_at`).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `request_id` | uuid | FK `feedback_requests`, cascade delete |
| `summary_text` | text | |
| `highlights` | jsonb, default `{}` | `{ strengths[], growth_areas[], themes[] }` |
| `response_count_at_analysis` | int, default `0` | **the incremental-analysis invariant**: if the current response count for the request equals this value, analysis is skipped (see `shouldSkipAnalysis` in `lib/feedback/analysis.ts`) rather than re-run |
| `created_at` | timestamptz | |

**RLS:** owner read-only. Writes happen via the admin client during
`POST /api/feedback/analysis/run`.

## Privacy invariant: the 2-responder floor

Anywhere feedback data is surfaced **outside the owner's dashboard**
(`app/api/feedback/public-summary/route.ts`, and the peer-feedback context
injected into RAG chat via `retrievePeerFeedbackSummary()` in
`lib/rag.ts`), the code requires `responder_count >= 2` before returning
any summary — even the aggregate. This exists specifically so a single
respondent's feedback can never be identified as "the" feedback about the
owner. Preserve this check in any new code path that surfaces feedback
data publicly.
