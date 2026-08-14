# Phase 02 — Unit Tests (Pure Logic)

**Depends on:** [01-test-runner-foundation.md](01-test-runner-foundation.md) — needs the
Vitest config, the `unit` project (`node` environment, `tests/unit/**`), and
`tests/setup/env.ts` to exist. Does not depend on Phases 03–07; can be worked in parallel
with them by a different agent once Phase 01 lands.

## Context

`personal-site` is a Next.js/TypeScript AI-powered interactive resume (Supabase +
Google Gemini). This phase covers the pure, dependency-free logic — validation,
formatting, RAG prompt/context assembly, chunking, auth gating. No mocking beyond
`console` spies and the occasional module stub is needed anywhere in this phase; that's
what makes it the best coverage-per-hour in the whole plan. Full project context and the
complete discovered-bug list are in [README.md](README.md) — several bugs below are
called out again inline because this phase is where they get pinned down as tests.

Write tests under `tests/unit/`, mirroring the source tree (e.g.
`tests/unit/lib/validation.test.ts` for `lib/validation.ts`).

## Targets

### `lib/validation.ts` — all four exports
- `validateString`: pin the `""` (empty string) short-circuit at line 30 — it returns
  early on empty/undefined/null *before* `minLength` is checked, meaning `minLength` is
  silently never enforced against an empty string. Also: multi-error accumulation (a
  value can fail multiple checks and get multiple messages), and that non-string values
  short-circuit immediately.
- `validateFeedbackSubmission`: token required, 20–100 chars (note: this is inconsistent
  with `isValidTokenFormat`'s ≥32 requirement in `lib/feedback/tokens.ts` — write a test
  documenting this inconsistency explicitly, don't just silently pick one to test); the
  10,000-char per-content-field cap; the 50,000-byte total-content-size cap
  (`JSON.stringify(content).length > 50000`).
- `sanitizeString` / `sanitizeStringObject`: confirm `sanitizeStringObject` silently drops
  non-string values and whitespace-only strings (this is intentional-looking but
  undocumented behavior — pin it so a future change to this is a deliberate decision, not
  an accident).

### `lib/gemini/client.ts` — `chunkText` (richest branching in the codebase, 6 paths)
Mock nothing — this function is pure. Cover:
1. Paragraph splitting on `/\n\n+/`, blank paragraphs dropped.
2. A paragraph at or under `maxChunkLength` is pushed as-is.
3. A paragraph over the limit is split by sentence (`/(?<=[.!?])\s+/`) and greedily
   packed.
4. **Known bug, write as a characterization test first:** a single word longer than
   `maxChunkLength` is pushed as its own over-length chunk (line ~121) rather than being
   truncated or hard-split. Also pin that `currentChunk` state leaks across sentence-loop
   iterations in a way that looks unintentional. Write the test to document *current*
   behavior (so it's a real regression test), then, separately, decide whether to fix the
   underlying bug — if you do fix it, update the test to assert the corrected behavior
   and note the fix in the commit message.
5. The whitespace-only-input → `[]` case.
6. The "no paragraphs found" whole-text and word-split fallback paths (lines ~137–158).

### `lib/llm.ts` — `generateJSON`
Mock only `generateContent` (from `lib/gemini/client.ts`) via `vi.mock`. Test the
markdown-fence-stripping sequence:
- ` ```json ... ``` ` fenced JSON strips cleanly.
- Bare ` ``` ... ``` ` (no language tag) strips cleanly.
- **Known bug:** uppercase ` ```JSON ` is *not* recognized (the check is a literal
  case-sensitive `startsWith("```json")`) — write a characterization test pinning the
  current (broken) behavior.
- **Known bug:** prose preceding the fence (e.g. `"Here's the JSON:\n\`\`\`json\n{...}"`)
  is not handled — the stripper only checks `startsWith`, so leading prose breaks parsing.
  Pin as a characterization test.
- The throw path when `JSON.parse` ultimately fails — assert the thrown error message
  format.

Also worth flagging in a comment near these tests, not fixing here: both this
fence-stripping logic and `job-compare`'s separate regex-based JSON extraction (see
Phase 03) exist because Gemini is being asked for JSON via prompt instructions rather
than its native structured-output mode. Gemini's JS SDK accepts a `responseSchema`
(Zod-compatible) that returns guaranteed-parseable JSON directly, which would eliminate
this whole bug class. That's a real product fix for `lib/llm.ts` and its call sites, out
of scope for this phase — just don't be surprised if these characterization tests get
superseded later.

### `lib/rag.ts` — the pure functions
- `prioritizeChunks`: confirm it's non-mutating (returns a new array via `[...chunks].sort`,
  doesn't mutate the input); two-tier sort (important-block chunks first, then similarity
  descending within each tier); missing metadata defaults `is_important` to `false` via
  `?? false`; respects the `limit` slice.
- `formatContextFromChunks`: empty-chunks-array returns the exact string
  `"No relevant information found in the knowledge base."`; unknown block id falls back to
  `"Unknown"` as the title; chunks are joined with `\n\n---\n\n`.
- `buildSystemPrompt`: both branches (`hasPeerFeedback` true/false) produce meaningfully
  different prompt text, and the peer-feedback instruction block only appears when true.
- `formatPeerFeedbackContext`: all four conditional sections (header always present;
  strengths/growth_areas/themes sections only rendered when their arrays are non-empty).
- Retrieval/ranking math: use hand-crafted fixed similarity values (e.g. chunks with
  similarity `0.9`, `0.5`, `0.3`) rather than anything embedding-shaped, so ranking-order
  assertions never depend on a real embedding model producing consistent output.

### `lib/auth.ts` — `isOwner`
**The single most security-critical pure function in the repo** — every owner-gated API
route and the dashboard layout depend on it. All 4 branches:
- `user` is `null` → `false`
- `user.email` is falsy → `false`
- `OWNER_EMAIL` env var unset → `false` (and confirm it `console.warn`s, since a silently
  "always false" owner check on a misconfigured deploy is a real footgun worth logging)
- Case-insensitive email match → `true`/`false` correctly

### `lib/chat/prompts.ts`
`getPromptsForMarquee`: the round-robin partition (`index % 3`) across all prompts is
exhaustive (every prompt appears in exactly one row) and disjoint; always returns exactly
3 rows even for edge-case input sizes.

### `lib/feedback/tokens.ts`
`generateFeedbackToken`: always 43 characters, charset `[A-Za-z0-9_-]`, and generate many
tokens in a loop to assert no collisions (not a proof of cryptographic security, just a
sanity check). `isValidTokenFormat`: boundary test at exactly 32 characters (the `{32,}`
regex boundary) — note this function has zero call sites in the app itself; test it
anyway since it's exported and might get wired in later.

### `lib/feedback/questions.ts`
`getMetadataQuestions()` returns exactly 4, `getContentQuestions()` returns exactly 6.
Invariant test: every question `id` in `FEEDBACK_QUESTIONS` is unique, and each question's
`category` is exactly one of `"metadata"` or `"content"` (no third state).

### `lib/logging.ts`
Spy on `console.log`/`warn`/`error`/`debug`. Cover: level-to-console-method routing;
`debug` calls are swallowed unless `NODE_ENV === "development"`; `logger.error` serializes
an `Error` instance to `{name, message, stack}` with `stack` only included in development,
and serializes non-`Error` values via `String(error)`; optional fields (`message`,
`context`, `duration_ms`) are conditionally spread and omitted (not `undefined`-valued)
when absent, since this feeds structured JSON logs where an explicit `undefined` key vs a
missing key can matter to downstream parsers. `logger.timed`: all three paths — sync
success, async resolve, async reject (confirm it rethrows the original error after
logging the failure, doesn't swallow it).

### `lib/analytics.ts`
`isAnalyticsEnabled()` needs to be tested in both a `node`-like environment (no `window`)
and a `jsdom`-like environment (has `window`) to exercise both branches — since this
phase's `unit` project runs under `node`, you may need either a small `// @vitest-environment jsdom`
override on just this one test file, or move these specific tests into the `components`
project instead. Use your judgment on which is cleaner. Assert the disabled path (`window`
undefined, or `NEXT_PUBLIC_POSTHOG_KEY` unset) never calls `posthog.capture`, and pin the
exact payload shape of each wrapper (`trackChatMessage`, `trackChatResponse`,
`trackPromptAnswered`, `trackPromptsRefreshed`, `trackJobAnalysis`,
`trackFeedbackSubmitted`, `trackImportanceToggled`).

## Two small refactors that pay for themselves immediately

Do these as part of this phase — they cost minutes and directly enable better tests:

1. Export `buildAnalysisPrompt` from `lib/feedback/analysis.ts:40` (currently private) so
   its prompt-formatting logic — response numbering, the `"Not specified"` relationship
   fallback, the conditional period line, mapping content keys through question labels
   with a key-name fallback — can be tested directly instead of only indirectly through
   `analyzeFeedback`.
2. Same for `buildAboutPrompt` in `lib/about.ts:89`.
3. Extract the pure display helpers currently inlined in client components into a new
   `lib/format.ts`, then unit test them there instead of only being able to exercise them
   through component rendering:
   - `formatFileSize` / `getFileIcon` from `app/dashboard/data/page.tsx:221`
   - `getSentimentColor` / `getStatusBadge` from `app/dashboard/feedback/page.tsx:152`
   - `getMatchColor` / `getScoreColor` from `app/(public)/job-analysis/page.tsx:86`

   Update the original components to import from `lib/format.ts` instead of defining
   these inline — a pure refactor, no behavior change.

## Verification

- `npm test` (or scope it: `npx vitest --project unit`) — all new tests pass.
- `npm run typecheck` and `npm run lint` clean.
- `npm run test:coverage` — expect this phase alone to push `lib/validation.ts`,
  `lib/chat/prompts.ts`, `lib/feedback/tokens.ts`, `lib/feedback/questions.ts`, and
  `lib/auth.ts` close to 100% line coverage, since they're fully pure.
- Spot-check: every "known bug" test above should have a comment noting it's a
  characterization test of current (possibly buggy) behavior, not an assertion that the
  behavior is correct.

## Commit

One commit for this phase, e.g.:
`test: add unit tests for validation, chunking, RAG formatting, and auth gating`
