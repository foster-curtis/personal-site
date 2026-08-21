# AI Pipeline (Gemini)

Every AI feature in this app goes through Google Gemini. There is exactly
one model call boundary: [`lib/gemini/client.ts`](../lib/gemini/client.ts).
Everything else — RAG, About-page generation, job comparison, feedback
analysis, prompt generation — builds a text prompt and calls one of its
exported functions.

## `lib/gemini/client.ts` — the actual SDK boundary

| Function | Model | Purpose |
|---|---|---|
| `generateContent(prompt)` | `GEMINI_MODEL` env or `gemini-2.5-flash` | Raw text generation, one-shot prompt in, string out |
| `generateWithContext(systemPrompt, context, userMessage)` | same | Wraps the three parts into one templated prompt for chat |
| `embedText(text)` | hardcoded `gemini-embedding-001` | Returns a 768-dim vector (the model defaults to 3072; `outputDimensionality: 768` truncates it via Matryoshka representation to match the DB's `vector(768)` column). **Not affected by `GEMINI_MODEL`** — the embedding model is separate from the generation model and isn't configurable via env. Was `text-embedding-004` until Google retired that model and it started 404ing — confirmed against the live API. |
| `embedTexts(texts[])` | same | Sequential (not parallel) calls, to avoid hitting rate limits |
| `chunkText(text, maxChunkLength=1000)` | n/a | Paragraph → sentence → word fallback splitter, pure string logic, no API call |

`getClient()` throws synchronously if `GEMINI_API_KEY` is unset — this
happens at call time, not at startup, so a missing key only surfaces the
first time a request needs the LLM.

## `lib/llm.ts` — the "provider-agnostic" layer

A thin wrapper (`generateText`, `generateJSON<T>`) that everything *other
than* the raw chat/job-compare paths calls through, explicitly designed to
make swapping providers easier later. Today it only ever calls into
`lib/gemini/client.ts`. `generateJSON` strips ```` ```json ```` /```` ``` ````
code fences before `JSON.parse`, and throws (with the raw text logged) if
parsing fails — callers need to handle that throw.

Two routes bypass this abstraction and call `lib/gemini/client.ts`
directly instead: `app/api/job-compare/route.ts` and
`app/api/prompts/generate|refresh/route.ts` (for the plain-text prompt
list). Job-compare in particular does its own regex-based JSON extraction
rather than using `generateJSON` — see the note in
[api-reference.md](./api-reference.md#job-comparison).

## RAG chat pipeline (`lib/rag.ts` + `app/api/chat/route.ts`)

```
user message
  → embedText(message)                                  [Gemini embedding]
  → supabase.rpc("match_embeddings", { query_embedding, match_threshold: 0.3, match_count: 10 })
  → getBlockMetadata(blockIds)                            [title + is_important per block]
  → prioritizeChunks(chunks, metadata, limit: 5)           [important blocks first, then similarity desc]
  → formatContextFromChunks(...)                            "[From: Title]\n<chunk text>" joined by "---"
  → retrievePeerFeedbackSummary()                            [only if >=2 responders; see data-model.md]
  → buildSystemPrompt(ownerName, hasPeerFeedback)
  → generateWithContext(systemPrompt, context, message)      [Gemini generateContent under the hood]
  → { response, sources: [{ title, similarity }] }
```

Key behaviors worth knowing before touching this:

- **10 chunks are retrieved but only 5 are used.** The extra 5 exist
  purely so `prioritizeChunks` has enough candidates to promote
  `is_important` blocks above lower-similarity-but-important content — if
  you lower `matchCount` below what you send to `prioritizeChunks`'s
  `limit`, important-block promotion stops having any effect.
- `match_threshold: 0.3` is a **similarity floor**, not a top-k cutoff —
  if fewer than 10 chunks clear it, fewer are returned (including zero,
  which produces "No relevant information found in the knowledge base."
  as the context).
- The system prompt (`buildSystemPrompt`) explicitly instructs the model
  to answer *only* from the provided context and to say so when it can't
  — this is the app's only grounding mechanism; there's no separate
  fact-checking or citation-verification step. `sources` returned to the
  client are the retrieved chunks, not a verification that the model
  actually used them.
- Peer feedback is appended as an extra labeled section
  (`=== PEER FEEDBACK SUMMARY ===`) in the same context string, not
  retrieved via the vector index — it's always-on-or-never based on the
  2-responder floor, not similarity-matched to the question.

## Embedding sync (`app/api/embed/route.ts`)

> **If you're reading this after the `text-embedding-004` → `gemini-embedding-001` switch:**
> the two models produce numerically incompatible vectors even at the same 768 dimensions —
> cosine similarity between an old and a new embedding is meaningless. Run a full resync
> (dashboard `SyncButton`, `sync_all: true`) once after deploying that change so every
> `content_embeddings` row comes from the same model; otherwise `match_embeddings` silently
> mixes the two and retrieval quality degrades without erroring.

Not automatic on every content change — it's triggered by:
- The dashboard `SyncButton` (`sync_all: true`) — full resync of every
  owned block.
- Resume page saves, when the `autoEmbed` toggle is on (default on) —
  single-block sync (`content_block_id`) after create/edit.
- Answering a prompt (`POST /api/prompts`) — fire-and-forget single-block
  sync for the newly created `qa` block.

Each sync **deletes all existing `content_embeddings` for that block
first**, then re-chunks and re-embeds from scratch — there's no diffing,
so editing a large block re-embeds it entirely even for a one-word change.
Per-chunk embedding failures are caught and logged individually; the sync
continues rather than aborting, so a partial sync (fewer chunks than
expected) is possible and only visible via the `chunks`/`embedded` counts
in the response.

There is **no automatic re-embed on delete** cleanup path in application
code — see the caveat in
[api-reference.md](./api-reference.md#delete-apidataid-).

## About-page generation (`lib/about.ts`)

```
fetchOwnerContentBlocks()  [resume + story types only, admin client]
  → buildAboutPrompt(blocks, ownerName)
  → generateJSON<AboutSummary>(...)                [lib/llm.ts → Gemini]
  → cache in about_cache, keyed by content_updated_at
```

If there are zero content blocks yet, `generateAboutSummary` short-circuits
to a hardcoded placeholder (`"${ownerName} is a software professional..."`)
without calling the LLM at all — useful to know if you're debugging "why
does About look generic," check content block count before assuming a
prompt problem.

Cache invalidation is timestamp-based, not event-based: `getAboutSummary()`
compares `about_cache.content_updated_at` against the max `updated_at`
across current resume/story blocks. Any edit to a resume/story block
invalidates the cache on the *next* `/about` page load (which regenerates
synchronously, and saves the new cache fire-and-forget). There's no
webhook or trigger — invalidation is purely "is my cached timestamp stale
compared to content right now."

## Job comparison (`app/api/job-compare/route.ts`)

Fetches resume+story+qa blocks for the owner (resolved via
`auth.admin.listUsers()` + `OWNER_EMAIL`, not the "first content_blocks
row" pattern — see [architecture.md](./architecture.md#single-owner-assumption)),
concatenates them into one `candidateProfile` string, and asks Gemini for
a large structured JSON object in a single prompt (see the full schema in
[api-reference.md](./api-reference.md#job-comparison)). This is a **direct**
`generateContent` call, not `generateJSON` — parsing is done manually via
`response.match(/\{[\s\S]*\}/)`, and a failure to parse degrades gracefully
to returning the raw text (`rawResponse`) rather than erroring, which the
frontend surfaces as a "couldn't be formatted" message with the raw text
logged to the browser console.

No caching — every submission re-sends the full candidate profile and
re-runs the LLM call, unlike About (cached) and feedback analysis
(skip-if-unchanged).

## Feedback analysis (`lib/feedback/analysis.ts`)

```
shouldSkipAnalysis(requestId)   [compares current response count vs feedback_summaries.response_count_at_analysis]
  → if unchanged: skip, return existing summary
  → else: getResponsesForAnalysis(requestId)
       → analyzeFeedback({ responses, ownerName })     [generateJSON, Gemini]
       → saveAnalysisResults(...)                        [insert feedback_summaries, update each response's sentiment_score/is_flagged]
```

`analyzeFeedback`'s prompt asks for three things in one call: an overall
summary (2–3 paragraphs), aggregate highlights
(strengths/growth_areas/themes), and **per-response** sentiment (1–10) +
flagging (abuse/spam/extreme-negative) + flag reason. This means a single
LLM call is responsible both for the aggregate narrative and for
per-response moderation — if you need to change the moderation logic
independent of the summary style (or vice versa), they currently can't be
tuned separately without restructuring this prompt into two calls.

Question labels used in the prompt (`questionLabels`) are pulled from
`lib/feedback/questions.ts` (`FEEDBACK_QUESTIONS`) so the LLM sees
human-readable labels rather than raw field keys like `worker_description`.

## Prompt generation (self-interview questions)

`app/api/prompts/generate/route.ts` and `.../refresh/route.ts` both: build
a one-shot text prompt from the owner's existing content block
titles/types, ask Gemini for `count` newline-separated questions (max 3 or
5 respectively), strip numbering (`^\d+[\.\)]\s*`), dedupe
case-insensitively against existing prompts, and top up any shortfall from
a hardcoded `PROMPT_TEMPLATES` array. This is the one AI path that uses
`generateContent` (plain text) rather than JSON mode, because the desired
output is literally "one question per line," not structured data.
