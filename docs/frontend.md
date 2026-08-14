# Frontend Guide

App Router, no client-side routing library beyond `next/navigation`. No
global state manager — every page manages its own `useState`/`useEffect`
and fetches directly from `/api/*` with the native `fetch`. There's no
shared data-fetching hook or SWR/React Query — each page duplicates its
own loading/error state pattern (`isLoading`, `error`, fetch-in-`useEffect`).
If you're adding a new data-fetching page, that hand-rolled pattern is the
existing convention, not an oversight to "fix" in isolation.

## Route map

| Path | File | Auth | Notes |
|---|---|---|---|
| `/` | `app/page.tsx` | public | Static landing page, no data fetching |
| `/about` | `app/(public)/about/page.tsx` | public | Client-fetches `GET /api/about` |
| `/chat` | `app/(public)/chat/page.tsx` | public | RAG chat UI |
| `/job-analysis` | `app/(public)/job-analysis/page.tsx` | public | JD paste → `POST /api/job-compare` |
| `/references` | `app/(public)/references/page.tsx` | public | Aggregated peer feedback, gated at ≥2 responders |
| `/feedback/[token]` | `app/(public)/feedback/[token]/page.tsx` | public (token-gated) | Anonymous submission form |
| `/login` | `app/(auth)/login/page.tsx` | public | Supabase email/password sign in + sign up |
| `/callback` | `app/(auth)/callback/route.ts` | n/a | Route handler, not a page — auth code exchange |
| `/access-denied` | `app/(auth)/access-denied/page.tsx` | authenticated non-owner | Friendly 403, not an error boundary |
| `/dashboard` | `app/dashboard/page.tsx` | owner only | Overview stats + embedding sync |
| `/dashboard/resume` | `app/dashboard/resume/page.tsx` | owner only | CRUD content blocks |
| `/dashboard/prompts` | `app/dashboard/prompts/page.tsx` | owner only | Answer/generate/refresh self-interview prompts |
| `/dashboard/data` | `app/dashboard/data/page.tsx` | owner only | Unified content + prompts + files view |
| `/dashboard/feedback` | `app/dashboard/feedback/page.tsx` | owner only | Manage requests, run analysis |

`/dashboard/*` pages don't each re-check auth — `app/dashboard/layout.tsx`
(a server component) does it once for the whole subtree. See
[auth-and-security.md](./auth-and-security.md).

## Shared components

### `components/layout/Header.tsx`
Global nav. Fetches `/api/auth/session` client-side on mount and on every
Supabase auth-state change to decide whether to show "Dashboard"/"Sign
Out" vs. "Sign In". This means the nav has a brief loading flash (`"..."`)
on every page load before session resolves — there's no server-rendered
session state passed down to avoid it.

### `components/chat/ChatMessage.tsx`
Renders one chat bubble. **User messages are plain text** (`whitespace-pre-wrap`);
**assistant messages are rendered as Markdown** via `react-markdown` +
`remark-gfm` (tables/strikethrough/etc.) + `remark-math`/`rehype-katex`
(LaTeX). Custom component overrides restyle every markdown element
(headings, code blocks, tables, blockquotes, links — links open
`target="_blank"` with `rel="noopener noreferrer"`) to match the site's
Tailwind design rather than relying on prose defaults. If Gemini's
response includes LaTeX, it renders inline — this is the only place in the
app KaTeX is used.

### `components/chat/PromptMarquee.tsx`
Horizontally auto-scrolling rows of clickable suggested questions (source
list: `lib/chat/prompts.ts`, `getPromptsForMarquee()` splits a flat list
into 3 alternating-direction rows). Accessibility notes baked into the
component (worth preserving if you touch it):
- Semantic `<nav aria-label="Suggested questions">` wrapper, each row is a
  `role="group"` with its own `aria-label`.
- Each row's content is duplicated (`[...row, ...row]`) so the CSS
  `translateX(-50%)` loop is seamless.
- Animation pauses on hover (CSS `:hover` rule in `globals.css`) and is
  fully disabled under `prefers-reduced-motion: reduce`.
- Fade-out gradient edges are `aria-hidden` (decorative only).
- Every button has an explicit `aria-label="Ask: <prompt>"` since the
  visible text alone could be ambiguous when duplicated across rows.

### `components/PostHogProvider.tsx`
Wraps the app in `PostHogProvider` from `posthog-js/react`, but **only if**
`NEXT_PUBLIC_POSTHOG_KEY` is set — otherwise it renders `children` directly
with no PostHog init at all (not even a no-op client). `trackEvent()` in
`lib/analytics.ts` independently checks for the key too, so calling a
tracking helper is always safe even if PostHog was never initialized. PII
is not intentionally sent to PostHog beyond whatever `capture_pageview`
autocaptures (path, referrer); `respect_dnt: true` is set.

## Analytics call sites (`lib/analytics.ts`)

Named helpers exist for: chat message sent/received, prompt
answered/refreshed, job analysis run, feedback submitted (with
relationship type), and content-block importance toggled. If you add a new
trackable user action, follow this pattern (a named wrapper function around
`trackEvent`) rather than calling `trackEvent` inline at the call site —
it's the established convention and keeps event names discoverable in one
file.

## Styling conventions

- Tailwind CSS 4, utility classes inline, no CSS Modules or styled-components.
- Dark mode via `dark:` variants driven by `prefers-color-scheme` (see
  `app/globals.css` — `--background`/`--foreground` CSS variables swap
  under `@media (prefers-color-scheme: dark)`). There's no manual
  light/dark toggle in the UI; it's OS-preference only.
- Consistent shell pattern across public pages: outer
  `min-h-screen bg-zinc-50 dark:bg-black`, inner `max-w-4xl` or `max-w-6xl`
  `mx-auto px-4`, card surfaces as
  `bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800`.
  New pages should match this rather than introducing a new shell.
- Loading states are hand-built `animate-pulse` skeletons matching each
  page's actual layout (see `about/page.tsx`, `references/page.tsx`,
  `feedback/[token]/page.tsx`) rather than a shared skeleton component.
- `app/globals.css` also carries KaTeX overrides and the marquee
  keyframes — it's small and worth reading in full before adding new
  global CSS, since most styling otherwise lives inline via Tailwind.

## Client/server boundary

Every interactive page is `"use client"` at the top; the only server
components are `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, and
`app/layout.tsx` (root). This means most pages fetch their own data
client-side after mount rather than via server-side data fetching — expect
a loading flash on every public page rather than server-rendered content
on first paint (the dashboard overview page is the one exception, since
it's a server component that queries Supabase directly at render time).
