# Phase 03 — Route Handler Integration Tests

**Depends on:** [01-test-runner-foundation.md](01-test-runner-foundation.md) — needs the
`api` project (`node` environment, `tests/api/**`), `tests/helpers/supabase-mock.ts`, and
`tests/helpers/request.ts`. Does not depend on Phase 02, though reading it first may be
useful context. Can be worked in parallel with Phases 02, 04–07 by a different agent once
Phase 01 lands.

## Context

`personal-site` is a Next.js/TypeScript AI-powered interactive resume with 17 API route
files under `app/api/**`, several of them **public and unauthenticated**, three of which
use the Supabase **service-role admin client that bypasses Row Level Security**. This is
the highest-risk part of the codebase from a security standpoint — untrusted input meets
elevated database privileges — and it currently has zero tests. Full project context and
the complete discovered-bug list are in [README.md](README.md).

Write tests under `tests/api/`, mirroring the route tree (e.g.
`tests/api/feedback/submit.test.ts` for `app/api/feedback/submit/route.ts`).

## Approach

Import the exported `GET`/`POST`/`PATCH`/`DELETE` functions directly from each route file
and invoke them with a constructed `Request`/`NextRequest` (via the `tests/helpers/request.ts`
builders from Phase 01). Assert on `response.status` and `await response.json()`. This
works because Next.js 16 route handlers take a standard `Request` and return a standard
`Response` — `NextRequest`/`NextResponse` are subclasses, and you only need the
`NextRequest` wrapper specifically when a handler reads `request.nextUrl` or
`request.cookies`.

Mock at the module boundary with `vi.mock`:
- `vi.mock("@/lib/supabase/admin")`
- `vi.mock("@/lib/supabase/server")`
- `vi.mock("@/lib/auth")`
- `vi.mock("@/lib/gemini/client")`

All three real Supabase client constructors are request-time factory functions, never
module-level singletons, so this mocking is clean with no import-order workarounds needed.

## Priority order (highest risk / highest value first)

### 1. `app/api/feedback/submit/route.ts` — the single highest-risk handler
Public endpoint, no auth, uses the admin client (bypasses RLS), accepts anonymous
untrusted input. Cover all 9 distinct error paths plus the success path:
1. Validation failure → `400` with `details: errors[]`
2. Missing token → `400` (note: currently unreachable in practice since validation
   already requires a token — write the test anyway, it documents intent)
3. Link not found → `404 "Invalid or expired feedback link"`
4. Link expired (`link.expires_at` in the past) → `410`
5. Submission limit reached (`max_submissions !== null && submission_count >= max_submissions`) → `410`
6. Parent feedback request not found → `404`
7. Feedback request `is_active === false` → `410`
8. Responder insert fails → `500`
9. Response insert fails → `500`
- Non-fatal: `submission_count` update failure is logged but does **not** fail the
  request — assert the response is still `201` in that case.
- Success → `201 {success: true, message: "Thank you for your feedback!"}`

**Add a failing test for a real gap:** the route checks `link.expires_at` but never
checks `feedbackRequest.expires_at` (the parent request's own expiry), even though the
sibling route `app/api/feedback/form/[token]/route.ts:77` *does* check it. Write a test
that submits feedback against a link whose *request* has expired but whose *link* hasn't,
and assert what actually happens (it will currently succeed when it arguably shouldn't).
Don't silently fix the route in this phase unless asked — the point here is to surface the
gap with a concrete failing/documenting test, since fixing it is a product decision
(should an expired request's still-valid links keep accepting submissions or not?).

### 2. `app/api/chat/route.ts` — the RAG orchestration seam
Mock `lib/rag` and `lib/gemini/client` and assert the full 8-step wiring:
1. `retrieveRelevantChunks` called with `(message, 10, 0.3)` — 10 chunks requested at a
   0.3 similarity threshold.
2. Block ids deduped via `Set` before metadata lookup.
3. `prioritizeChunks` called with a limit of 5.
4. Title map built from block metadata.
5. `formatContextFromChunks` called with the prioritized chunks.
6. `retrievePeerFeedbackSummary` called; when it returns non-null, the peer-feedback
   context is appended to the main context string.
7. `buildSystemPrompt("Foster Curtis", hasPeerFeedback)` — confirm `hasPeerFeedback` flips
   correctly based on whether peer feedback was found.
8. `generateWithContext` called with the assembled system prompt, context, and user
   message; its return value is what's sent back as `response`.
- Also assert the `sources` array in the response echoes `{title, similarity}` for each
  returned chunk.
- Missing `message` in the request body → `400`.
- Any thrown error anywhere in the pipeline → `500 {error: "Failed to get response"}`.

### 3. `app/api/data/route.ts` and `app/api/data/[id]/route.ts`
The auth × ownership × `PGRST116`-not-found matrix:
- Both files: unauthenticated or non-owner → `401` on every method.
- `POST /api/data`: missing `type`/`title`/`body_text` → `400`; invalid `type` (not one of
  `resume`/`story`/`qa`/`file_metadata`) → `400`; **`is_important` defaults to `true`
  automatically when `type === "resume"`** — assert this default explicitly, it's an
  easy-to-miss piece of business logic.
- `GET /api/data/[id]`: not found (`PGRST116`) → `404`; other DB errors → `500`.
- `PATCH /api/data/[id]`: partial update — only fields present in the request body are
  included in the update payload sent to Supabase (assert the mock receives exactly the
  fields you sent, nothing else); an empty update body → `400 "No fields to update"`;
  `PGRST116` → `404`.
- `DELETE /api/data/[id]`: **known bug** — deleting a nonexistent id currently returns
  `200 {success: true}` instead of `404`, because the route doesn't check whether a row
  was actually deleted. Write a characterization test pinning this current behavior.

### 4. `app/api/feedback/form/[token]/route.ts`
Public, no auth, admin client. 5 error paths: link not found (`404`), link expired
(`410`), submission limit reached (`410`), parent request not found (`404`),
`!is_active` (`410`), request itself expired (`410`) — 6 total including both expiry
checks (note this route *does* check both, unlike the submit route above). Assert the
success response includes only non-sensitive fields — no internal ids beyond what's
needed to render the form, no other responders' data.

### 5. `app/api/feedback/public-summary/route.ts` — the anonymity gate
**This is a privacy control; it deserves an explicit, named test.** Assert:
- No summary exists → `200 {available: false, message: "No peer feedback available yet"}`
- Summary exists but `responder_count < 2` → `200 {available: false, ...}` — the feedback
  must **not** be exposed with fewer than 2 respondents, since with only 1 respondent the
  "anonymous" feedback is trivially attributable.
- `responder_count >= 2` → `200 {available: true, summary_text, highlights, responder_count, generated_at}`

### 6. `app/api/job-compare/route.ts`
Public, no auth, admin client, calls Gemini. This route has its **own** bespoke JSON
extraction (`response.match(/\{[\s\S]*\}/)` then `JSON.parse`) — separate from and
different than `lib/llm.ts`'s `generateJSON`. Test:
- Empty/missing `jobDescription` → `400`.
- `OWNER_EMAIL` unset → `500 "Owner not configured"`.
- No matching owner found via `auth.admin.listUsers()` → `404 "No candidate profile found"`.
- No content blocks for the owner → `404`.
- **Successful extraction** → `200 {analysis: {...parsed JSON...}}`.
- **Failed extraction** (Gemini returns non-JSON or malformed JSON) → `200` (not an error
  status!) `{analysis: null, rawResponse: <raw text>, error: "Failed to parse structured analysis"}`.
  This 200-on-parse-failure behavior is easy to miss — write the test explicitly asserting
  the status code is 200, not 500, in this case.

### 7. `app/api/embed/route.ts`
Owner-only (`401` when not owner). `content_block_id` XOR `sync_all` — neither provided →
`400`. Per-chunk embedding/insert failures during a sync are **logged and skipped**, not
fatal to the overall request — assert a request with one failing chunk among several still
returns `200` with `totalChunks` counting only the successful ones. `GET` returns
`{content_blocks, embeddings}` counts.

### 8. `app/(auth)/callback/route.ts`
The 3-way redirect: valid code + owner email match → redirect to `/dashboard`; valid code
but non-owner → redirect to `/access-denied`; missing code or exchange error → redirect
to `/login?error=auth_failed`.

### 9. `app/api/files/route.ts`
Owner-only. MIME allowlist (`application/pdf`, `image/png`, `image/jpeg`, `image/gif`,
`text/plain`) → `400` for anything else. 50MB size cap → `400` when exceeded. Filename
sanitization (`.replace(/[^a-zA-Z0-9.-]/g, "_")`) — assert a filename with special
characters gets sanitized in the stored path. **Compensating-action test:** if the
database insert fails after a successful storage upload, the uploaded object is removed
(`storage.remove`) — assert this cleanup call happens, so failed uploads don't leave
orphaned files in the bucket.

### 10. `middleware.ts`
Security headers on `/api/*` paths: `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`. Rate-limit *informational* headers differ by path —
`X-RateLimit-Limit: 10` / `Window: 60` for `/api/feedback/submit` and `/api/chat`, versus
`60`/`60` for everything else. (Note: these headers are informational only and don't
actually enforce anything — that's a separate concern flagged in
[09-devops-recommendations.md](09-devops-recommendations.md), not something to fix here.)

## Cross-cutting: the owner-gate sweep

Write one table-driven test file (e.g. `tests/api/owner-gate.test.ts`) that iterates over
every owner-only route handler (`embed`, `data`, `data/[id]`, `feedback/analysis/[requestId]`,
`feedback/analysis/run`, `feedback/requests`, `feedback/requests/[id]`, `files`,
`files/[id]`, `prompts`, `prompts/generate`, `prompts/refresh`, and the `about` route's
`POST`) and asserts each returns `401` for both an unauthenticated request and a request
from an authenticated non-owner user. This is cheap to write and catches the single worst
possible regression: an admin-only endpoint accidentally becoming public.

## Other notes

- `app/api/prompts/route.ts` self-calls `/api/embed` and `/api/prompts/generate` via
  `fetch` after answering a prompt — stub global `fetch` for this route's tests.
- `app/api/prompts/generate/route.ts` and `app/api/prompts/refresh/route.ts` use
  `Math.random()` for template fallback selection — seed or mock it (`vi.spyOn(Math, "random")`)
  so the fallback-template test is deterministic.

## Verification

- `npm test` (or scope: `npx vitest --project api`) — all new tests pass.
- `npm run typecheck` and `npm run lint` clean.
- The owner-gate sweep test explicitly lists every owner-only route it covers in a
  comment, so a newly added owner-only route in the future is an obvious diff against
  that list (it won't be auto-discovered — flag this as a known limitation in a comment).
- Manually confirm at least one test per route file actually exercises the **admin**
  client path where relevant (not just the server client), since admin-client bugs are
  the ones that bypass RLS and matter most.

## Commit

One commit for this phase, e.g.:
`test: add integration tests for API route handlers and the owner-gate sweep`
