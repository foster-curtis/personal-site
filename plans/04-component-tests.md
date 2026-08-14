# Phase 04 — Component Tests

**Depends on:** [01-test-runner-foundation.md](01-test-runner-foundation.md) — needs the
`components` project (`jsdom` environment, `tests/components/**`) and
`tests/setup/dom.ts`. Independent of Phases 02, 03, 05–07; can be worked in parallel by a
different agent once Phase 01 lands.

## Context

`personal-site` is a Next.js/TypeScript AI-powered interactive resume. This phase covers
React component tests using `@testing-library/react` under `jsdom`. Full project context
is in [README.md](README.md).

**Scope is deliberately thin: five components with real logic, not a render-everything
sweep.** The rest of the component tree is either presentational (low value to test) or an
async Server Component, which current tooling cannot unit test at all (see the note at the
end of this file) — those are covered by E2E in Phase 05 instead.

Write tests under `tests/components/`, mirroring the source tree.

## Targets

### 1. `components/chat/PromptMarquee.tsx` — the best-isolated component in the repo
- Props: `{promptRows: string[][], onPromptClick: (prompt: string) => void, disabled?: boolean}`.
- The component duplicates each row via `useMemo` for a seamless CSS marquee scroll effect
  — assert that for a row of N prompts, `2N` buttons are rendered (not N).
- `disabled={true}` → component renders `null` entirely; assert nothing is in the DOM.
- Clicking a prompt button calls `onPromptClick` with that exact prompt string.
- Accessibility contract — assert these exist, don't just eyeball the markup:
  - The wrapping `<nav>` has `aria-label="Suggested questions"`.
  - Each row has `role="group"` with its own `aria-label`.
  - Each button has `aria-label={"Ask: " + prompt}`.
  - Fade-edge decorative elements have `aria-hidden`.

### 2. `components/chat/ChatMessage.tsx`
- Branches on `message.role === "user"`: user messages render as plain text (a `<p>`, not
  parsed as markdown); assistant messages render through `ReactMarkdown` with
  `remark-gfm`/`remark-math`/`rehype-katex`. Write a test asserting that literal markdown
  syntax in a **user** message (e.g. `**bold**`) renders as the literal asterisk
  characters, not as bold — this is the behavior that would silently break if someone
  "simplified" the component to always use `ReactMarkdown`.
- For an assistant message, assert markdown actually renders (e.g. a `**bold**` input
  produces a `<strong>` element).
- Links in assistant markdown get `target="_blank"` and `rel="noopener noreferrer"` —
  assert both attributes are present (missing `rel` here is a real security/tabnabbing
  concern, worth pinning explicitly).

### 3. `app/(public)/feedback/[token]/page.tsx`
This is a client component despite the file being under `app/`. Focus on:
- **The metadata/content partition in `handleSubmit`** (around lines 72–86) — this is the
  most test-worthy client-side logic in the repo. Given a set of form field values, assert
  they're correctly split into the `metadata` object (relationship, worked_from, worked_to,
  role) vs the `content` object (worker_description, character_comments, etc.) based on
  each question's declared `category`, and that blank/empty values are dropped from the
  submitted payload rather than sent as empty strings.
- The four mutually exclusive top-level render states: loading skeleton, error-without-data,
  submitted-success, and the form itself. Test each state renders distinctly and that
  transitions between them happen at the right trigger (e.g. loading → form once the fetch
  resolves; form → submitted-success once the POST succeeds).
- `trackFeedbackSubmitted(metadata.relationship)` — assert it's called with the correct
  argument on successful submit (mock `lib/analytics`).

### 4. `app/(public)/chat/page.tsx`
- Optimistic append: submitting a message immediately adds it to the visible message list
  before the API response arrives.
- The prompt marquee is shown only when `messages.length === 0` — assert it disappears
  after the first message is sent.
- **Error path:** when the `/api/chat` fetch fails or returns a non-ok status, assert the
  UI appends a *visible assistant message* reading something like "Sorry, I encountered an
  error. Please try again." — this is a deliberate UX choice (errors shown as a chat
  message rather than a toast/banner) and it's easy to accidentally regress into a silent
  failure.
- `isLoading` state disables the input/submit appropriately and is cleared in a `finally`
  block regardless of success or failure.

### 5. `components/layout/Header.tsx`
- Three render states: loading (shows a placeholder like `"..."`), signed-out, signed-in.
- The "Dashboard" link is present **only** when the fetched session reports `isOwner: true`
  — assert it's absent for a signed-in non-owner user, not just absent when signed-out.
- `handleLogout` calls the logout endpoint and updates local state.

## What's out of scope for this phase (and why)

Async Server Components — `app/dashboard/layout.tsx` (the auth guard that redirects
unauthenticated/non-owner users) and `app/dashboard/page.tsx` (the stats dashboard) — are
**not unit-testable with current tooling.** This isn't a workaround being taken here; it's
the official Next.js position, stated directly in their testing docs: *"Since `async`
Server Components are new to the React ecosystem, some tools do not fully support them. In
the meantime, we recommend using End-to-End Testing over Unit Testing for `async`
components."* (<https://nextjs.org/docs/app/guides/testing>). Their auth-guard behavior —
which matters a lot, since it's the thing standing between the public internet and the
dashboard CMS — is covered by the E2E auth-guard test in
[05-e2e-smoke-suite.md](05-e2e-smoke-suite.md) instead. Don't attempt to force these into
this phase; it'll waste time fighting tooling that genuinely doesn't support it yet.

## Verification

- `npm test` (or scope: `npx vitest --project components`) — all new tests pass.
- `npm run typecheck` and `npm run lint` clean.
- Confirm `@testing-library/jest-dom` matchers (`toBeInTheDocument`, etc.) type-check
  cleanly — if Phase 01 flagged the Vitest 4.1.6/4.1.7 type-augmentation issue as
  unresolved and pinned an older Vitest version, this phase is where that would first
  surface as a real problem if it wasn't actually fixed.
- Each accessibility assertion in the `PromptMarquee` test should query by the actual
  ARIA attribute/role, not by incidental text content, so the test would catch a real
  regression in the a11y wiring.

## Commit

One commit for this phase, e.g.:
`test: add component tests for chat UI, feedback form, and header auth state`
