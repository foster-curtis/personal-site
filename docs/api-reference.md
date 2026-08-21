# API Reference

All routes are Next.js App Router Route Handlers under `app/api/`. None of
them use a shared middleware for auth — **every owner-only route
independently calls `getUser()` + `isOwner()`** (see
[auth-and-security.md](./auth-and-security.md)). There is no versioning; all
routes are unprefixed (`/api/...`).

Legend: 🔒 = owner-only (requires an authenticated session where
`user.email === OWNER_EMAIL`). 🌐 = public, no auth. Response bodies are
paraphrased `interface`s, not exhaustive — check the route file for exact
shape when in doubt.

---

## Auth

### `GET /api/auth/session` 🌐
Returns the current session, if any. Polled client-side by
`components/layout/Header.tsx` to decide what nav links to show.

```ts
{ user: { id: string; email: string } | null; isOwner: boolean }
```

### `POST /api/auth/logout` 🌐
Signs out the current Supabase session (server-side `signOut()`, clears
the cookie). `{ success: true }` or `{ error }`.

> Note: most of the UI actually signs out via the **client-side** Supabase
> client (`supabase.auth.signOut()` in `Header.tsx`, `access-denied/page.tsx`)
> rather than calling this endpoint — this route exists but isn't the only
> way sign-out happens.

---

## Chat (RAG)

### `POST /api/chat` 🌐
Body: `{ message: string }`.

Pipeline (see [ai-pipeline.md](./ai-pipeline.md) for full detail): embed the
message → retrieve top-10 chunks (`match_threshold=0.3`) → prioritize
important-block chunks first, trim to top 5 → append anonymized peer
feedback if ≥2 responders exist → generate with Gemini.

```ts
{
  response: string;
  sources: { title: string; similarity: number }[];
}
```
No input length limit is enforced server-side on `message`.

---

## Content blocks (`content_blocks`)

### `GET /api/data` 🔒
Query param `?type=resume|story|qa|file_metadata` (optional filter).
Returns `{ data: ContentBlock[] }`, newest first, scoped to the owner.

### `POST /api/data` 🔒
Body: `{ type, title, body_text, source_question_id? }`. `type` must be one
of the four valid values. New `resume`-type blocks are automatically
created with `is_important: true`; all others default `false`.
Returns `{ data: ContentBlock }`, status 201.

### `GET /api/data/[id]` 🔒
Single block, 404 if not found or not owned by the caller.

### `PATCH /api/data/[id]` 🔒
Body: any subset of `{ type, title, body_text, is_important }`. 400 if the
body is empty. Used both for full edits (resume page) and the lightweight
importance toggle (`is_important` only, from both the resume and data
dashboard pages).

### `DELETE /api/data/[id]` 🔒
Deletes the block. **Does not explicitly delete its `content_embeddings`
rows or its `files` row** — whether those clean up depends on DB-level
`ON DELETE CASCADE` foreign keys that aren't visible in this repo (see
[data-model.md](./data-model.md#-the-migrations-folder-is-not-a-full-schema)).
If you see orphaned embeddings surviving a delete, this is why.

---

## Embeddings

### `POST /api/embed` 🔒
Body: `{ content_block_id?: string, sync_all?: boolean }` — exactly one
should be meaningful (at least one required).

For each targeted block: combines `title + body_text`, chunks it
(`chunkText`, ~1000 chars/chunk, paragraph→sentence→word fallback),
**deletes all existing embeddings for that block**, then generates and
inserts a fresh embedding per chunk via Gemini `gemini-embedding-001`.
Per-chunk failures are logged and skipped rather than aborting the whole
sync.

```ts
{
  message: string;
  embedded: number;   // blocks processed
  chunks: number;      // embeddings actually inserted
  results: { block_id: string; title: string; chunks: number }[];
}
```

### `GET /api/embed` 🔒
Returns counts for the dashboard overview: `{ content_blocks: number, embeddings: number }`.

---

## About page

### `GET /api/about` 🌐
Returns the cached About-page summary if valid, otherwise generates and
caches a fresh one (see [ai-pipeline.md](./ai-pipeline.md)). Cache validity
= `about_cache.content_updated_at >= max(content_blocks.updated_at)` for
resume/story blocks.

```ts
{
  summary: string;
  headline: string;
  highlights: string[];
  skills: string[];
  interests: string[];
  generatedAt: string;
  fromCache?: boolean;
  ownerName: string;
  lastContentUpdate: string | null;
}
```

### `POST /api/about` 🔒
Forces regeneration (clears + rewrites the cache), same response shape
plus `message`.

---

## Job comparison

### `POST /api/job-compare` 🌐
Body: `{ jobDescription: string }`. Fetches the owner's resume/story/qa
content, builds one large prompt, asks Gemini for a structured fit
analysis (not via `generateJSON` — this route calls `generateContent`
directly and regexes `\{[\s\S]*\}` out of the raw response, falling back to
returning `rawResponse` if parsing fails).

```ts
{
  analysis: {
    overallMatch: "strong" | "moderate" | "developing";
    matchScore: number;       // 1-100
    summary: string;
    strengths: { area: string; evidence: string; relevance: string }[];
    partialMatches: { requirement: string; candidateExperience: string; gap: string; transferability: string }[];
    gaps: { requirement: string; assessment: string; mitigation: string }[];
    recommendation: {
      hire: boolean;
      confidence: "high" | "medium" | "low";
      reasoning: string;
      interviewFocus: string[];
    };
  } | null;
  rawResponse?: string; // present when JSON parsing failed
}
```
No rate limiting or length cap on `jobDescription` beyond the "non-empty"
check — an expensive endpoint to leave unrestricted (see
[auth-and-security.md](./auth-and-security.md) on the rate-limit headers
being informational only).

---

## Prompts (self-interview questions)

### `GET /api/prompts` 🔒
`?all=true` returns every prompt (pending + answered); otherwise up to 3
pending prompts. `{ prompts: Prompt[] }`.

### `POST /api/prompts` 🔒
Answer a prompt. Body: `{ promptId: string, answerText: string }`.
1. Verifies the prompt exists, is owned by the caller, and is `pending`.
2. Creates a `content_blocks` row (`type: "qa"`, title = prompt text
   truncated to 100 chars, `source_question_id` = the prompt id).
3. Marks the prompt `answered`, sets `answer_block_id`.
4. Fire-and-forget: `POST /api/embed` for the new block, then
   `POST /api/prompts/generate` (`count: 1`) to replenish the pool —
   **both calls go over HTTP** (`fetch(new URL(..., request.url))`) rather
   than calling the underlying functions directly in-process.

`{ success: true, block: ContentBlock }`.

### `POST /api/prompts/generate` 🔒
Body: `{ count?: number }` (clamped to max 3). Generates new prompts,
avoiding duplicates (case-insensitive) against **all** existing prompts
(pending + answered). If the owner has existing content, asks Gemini for
personalized questions based on content block titles/types; always falls
back to a static template list (`PROMPT_TEMPLATES`, duplicated in
`app/api/prompts/refresh/route.ts` — keep both in sync if you edit it) to
fill any shortfall. `{ created: number, prompts: Prompt[] }`.

### `POST /api/prompts/refresh` 🔒
Body: `{ count?: number }` (clamped to max 5, default 3). **Deletes all
pending prompts** for the owner, then generates replacements the same way
as `/generate` (dedup against answered prompts only, since pending ones
were just wiped). `{ success: true, created: number, prompts: Prompt[] }`.

---

## Files

### `GET /api/files` 🔒
`{ data: FileRecord[] }`, owner's files, newest first.

### `POST /api/files` 🔒
`multipart/form-data` with a `file` field. Validates MIME type (pdf, png,
jpeg, gif, text/plain only) and size (≤50MB), uploads to the `owner-files`
Storage bucket at `{owner_id}/{timestamp}_{sanitized_filename}`, then
inserts a `files` row. If the DB insert fails after a successful storage
upload, the uploaded object is removed to avoid orphaned storage.
`{ data: FileRecord }`, status 201.

### `GET /api/files/[id]` 🔒
Returns file metadata plus a **1-hour signed download URL**:
`{ data: FileRecord, downloadUrl: string }`.

### `DELETE /api/files/[id]` 🔒
Removes the storage object first, then the DB row, **continuing to delete
the DB row even if the storage removal fails** (logged, not fatal).
`{ success: true }`.

---

## Feedback

### `GET /api/feedback/requests` 🔒
All feedback requests for the owner, each enriched with its `links[]` and
`response_count`/`responder_count`. `{ data: FeedbackRequestWithStats[] }`.

### `POST /api/feedback/requests` 🔒
Body: `{ title?, notes?, expires_at?, is_active? }`. Creates the request
**and** a single feedback link in one call (token via
`generateFeedbackToken()`, `max_submissions: 1`). If link creation fails,
still returns 201 with `warning: "Request created but link generation failed"`
rather than rolling back the request.

### `GET /api/feedback/requests/[id]` 🔒
Detailed view: request + links + aggregated stats (`response_count`,
`responder_count`, `flagged_count`, `average_sentiment`) + a minimal
per-response list (`id`, `created_at`, `is_flagged`, `sentiment_score` —
**never raw response content**, even for the owner on this listing
endpoint).

### `GET /api/feedback/form/[token]` 🌐
Validates a token (existence, link expiry, submission limit, parent request
active + not expired) and returns just enough to render the form:
```ts
{
  request: { id: string; title: string | null; notes: string | null };
  link: { id: string; token: string; expires_at: string | null; max_submissions: number | null; submission_count: number };
}
```
404/410 with an error message on any validation failure (410 = "gone", used
for expired/exhausted links rather than 403/404, so the client can
distinguish "never existed" from "existed but closed" if desired — though
the current UI treats them the same).

### `POST /api/feedback/submit` 🌐
Body validated against `validateFeedbackSubmission` (token 20–100 chars;
`content` fields ≤10,000 chars each, ≤50KB total serialized; `metadata`
fields ≤100/50 chars as applicable) then sanitized
(`sanitizeStringObject`, trim + hard length cap) before storage. Re-checks
token validity/expiry/limit/active status server-side (independent of the
form-fetch route). Creates a **new** `feedback_responders` row + one
`feedback_responses` row, increments `feedback_links.submission_count`.
No sentiment/flag is set here — that happens later via analysis.
`{ success: true, message }`, status 201. See
[data-model.md](./data-model.md#feedback_responders-002_feedback_tablessql)
for the "new responder per submission" caveat.

### `POST /api/feedback/analysis/run` 🔒
Body: `{ request_id: string }`. Skips (returns
`{ skipped: true, message, summary: <existing>, response_count }`) if
`feedback_summaries.response_count_at_analysis` already equals the current
response count for that request — this is the incremental-analysis
invariant, see [data-model.md](./data-model.md#feedback_summaries-003_feedback_summariessql).
Otherwise runs `analyzeFeedback()` (Gemini, JSON mode) over every response,
producing a summary + per-response sentiment score (1–10) and flag
(abusive/spam/extreme-negative), persists via `saveAnalysisResults()`
(inserts `feedback_summaries`, updates each `feedback_responses` row).
`{ skipped: false, message, summary, response_count, flagged_count }`.

### `GET /api/feedback/analysis/[requestId]` 🔒
Latest summary + stats, same shape family as
`GET /api/feedback/requests/[id]` but request-specific and includes
`relationship` per response in `responses_summary`. Does **not** run
analysis — read-only.

### `GET /api/feedback/public-summary` 🌐
Aggregates across **all active feedback requests** for the owner (most
recent `feedback_summaries` row), returns `available: false` with a
message if there's no summary yet or fewer than 2 responders (privacy
floor — see [data-model.md](./data-model.md#privacy-invariant-the-2-responder-floor)).
```ts
{ available: false, message: string }
// or
{ available: true, summary_text: string, highlights: {...}, responder_count: number, generated_at: string }
```

---

## Owner resume (public mirror)

### `GET /api/owner/resume` 🌐
Returns the owner's `resume`+`story` content blocks plus a concatenated
markdown `summary` string. Used as a lightweight, unauthenticated way to
fetch "the resume" without going through chat or job-compare. Resolves the
owner via `supabase.auth.admin.listUsers()` + `OWNER_EMAIL` match (not the
"first content_blocks row" pattern used elsewhere — see
[architecture.md](./architecture.md#single-owner-assumption)).
