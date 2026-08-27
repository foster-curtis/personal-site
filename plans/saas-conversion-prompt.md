# Task

You are planning a multi-phase conversion of an existing single-user application into a
multi-tenant SaaS product. **You are writing plans, not code.** Your entire output is a set
of markdown files under `plans/saas-conversion/`. Do not modify any application code,
schema, or config outside that folder.

Each phase file you write will be handed to a **Sonnet-class agent with no memory of this
conversation and no access to your reasoning**. Assume that agent is competent but starts
cold. Every phase file must be self-sufficient: it restates the context it needs, names the
exact files to touch, and defines its own verification. A phase that requires the agent to
infer intent from a sibling phase file has failed.

Before writing anything, **read the codebase thoroughly.** The findings below came from a
partial review and are a floor, not a ceiling. You are expected to discover more.

---

# Part 1 — The repository as it exists

## What it is

`personal-site` — an AI-powered interactive resume, currently built for exactly one user
(the repo owner, Foster). Public visitors can:

- read an AI-generated About page
- chat with a RAG-backed assistant grounded in the owner's real resume/story content
- paste a job description and get an AI fit analysis
- view anonymized aggregate peer feedback
- submit peer feedback via a tokenized link

The owner logs in at `/dashboard` to manage content blocks, prompts, files, and feedback.

## Stack

Next.js 16.1.4 (App Router), React 19.2, TypeScript (strict), Tailwind CSS 4, Supabase
(Postgres + pgvector + Auth + Storage, via `@supabase/ssr`), Google Gemini
(`gemini-2.5-flash` + `gemini-embedding-001`), PostHog. Path alias `@/* -> ./*`.

## Current state — this is a healthy codebase, not a prototype

Roughly 15,000 lines, of which ~4,600 are tests and ~1,260 are docs. There is a working
Vitest suite (unit / api / components projects, fully offline), a Playwright E2E suite, a
pgTAP database suite, an evals harness, and a GitHub Actions CI pipeline.
`supabase/migrations/` has 7 migrations and is the source of truth for schema.

Read `AGENTS.md` first — it is the operating manual for agents in this repo and it is
accurate. Note especially its testing rule (new/changed code needs a test in a mirrored
location) and its docs-sync rule (route/schema/auth/AI-pipeline changes must update the
matching file in `docs/`). **Every phase you write must honor both rules.**

Read `docs/` (7 files: architecture, data-model, api-reference, auth-and-security,
ai-pipeline, frontend, dev-setup). They are hand-written and current.

Read `plans/README.md` and `plans/02-unit-tests.md`. That existing plan set is the **house
style you are matching** — a README index carrying shared context, plus per-phase files.
Study its structure, tone, and level of specificity closely. Your output should feel like
it was written by the same hand. Note that the bug list in `plans/README.md` is historical:
some of those bugs have since been fixed. **Verify each against current code rather than
inheriting the list.**

---

# Part 2 — The business goal

Convert this into a subscription SaaS where any user can sign up, get their own
AI-powered personal site, and pay monthly. Recruiters visit a user's public page to chat
with their AI assistant, run a job-fit analysis, and read anonymized peer feedback.

## Architectural decisions already made — do not re-litigate these

These were decided after review. Treat them as settled inputs and design the phases around
them. If you find hard evidence that one is unworkable, say so explicitly in the overview
file rather than silently planning something else.

1. **Refactor in place; do not rewrite from scratch.** The schema is already multi-tenant
   (`owner_id` on every table, RLS keyed on `auth.uid() = owner_id`), and all ~20 dashboard
   API routes already scope by `user.id` rather than a global owner. The single-owner
   coupling is concentrated in roughly 8 files. A rewrite would rebuild the same
   architecture while reintroducing bugs into solved problems (anonymity floor, feedback
   token generation, embedding chunking, about-cache invalidation).

2. **Path-based tenant URLs at the root: `airesume.com/jackson-smith`.** Not subdomains
   initially, and not a `/u/` prefix — the URL is shown to recruiters and vanity matters.
   This requires a reserved-slug list guarding `about`, `chat`, `dashboard`, `login`,
   `api`, `pricing`, `signup`, and similar. Resolve the tenant **once in middleware** and
   pass it down, so subdomains and custom domains become a later middleware-rewrite feature
   rather than an architectural change. Plan for that future rewrite seam explicitly.

3. **One shared database with strict RLS.** Not a database or Supabase project per tenant.
   The schema is already built for this.

4. **Tighten the admin-client bypass.** `lib/supabase/admin.ts` uses the service-role key
   and bypasses RLS entirely; 9 files use it. The target is a single
   `getTenantScopedClient(tenantId)` helper plus an ESLint rule banning bare
   `createAdminClient()` inside `app/api/**`. Where possible, prefer real RLS policies
   (e.g. a public-read policy keyed on an `is_public` column) over service-role bypass for
   anonymous public reads, so the bypass surface shrinks to genuinely privileged work.

---

# Part 3 — Known problems to fix

Confirmed by reading the code. Verify each still exists, then assign it to a phase.

## Cross-tenant data leaks (highest severity — these break on user #2)

- **`match_embeddings()` has no tenant filter.**
  `supabase/migrations/006_match_embeddings.sql` scans all of `content_embeddings`
  globally. `lib/rag.ts` calls it through the service-role admin client, so RLS does not
  save you. Multi-tenant, the RAG chat would retrieve chunks from every user's resume.
  Needs an owner parameter and a filter.

- **`SELECT owner_id FROM content_blocks LIMIT 1` as owner resolution.** Three places:
  `lib/about.ts` (~line 245, `getOwnerId()`), `lib/rag.ts` (~line 171,
  `retrievePeerFeedbackSummary`), `lib/feedback/analysis.ts` (~line 276,
  `getPublicFeedbackSummary`). Returns an arbitrary user's id. With one user it is always
  correct; with two it serves the wrong person's resume and private peer feedback.

- **`lib/about.ts` (~line 41) queries `.from("auth.users")`**, which PostgREST cannot reach
  (public schema only). That lookup always errors, so the `LIMIT 1` fallback below it is
  not a fallback — it is the only live path.

- **`about_cache` RLS is wide open.** `supabase/migrations/001_about_cache.sql` has
  `FOR ALL USING (true) WITH CHECK (true)`, which is permissive to every role including
  `anon`, not just service_role.

## Scaling and correctness

- **`auth.admin.listUsers()` email scans** in `app/api/job-compare/route.ts` (~line 27) and
  `app/api/owner/resume/route.ts` (~line 19). Paginates at 50 by default, so this breaks
  silently past 50 users. Replace with slug-based tenant lookup.

- **Hardcoded owner identity.** `"Foster Curtis"` appears as a default argument in
  `app/api/chat/route.ts` (~line 53, `buildSystemPrompt`) and in `lib/about.ts`
  (`getAboutSummary`). Search for other hardcoded personal details.

- **Rate limiting is decorative.** `middleware.ts` sets `X-RateLimit-*` headers that
  nothing enforces. `AGENTS.md` documents this honestly. Real enforcement is required
  before launch.

- **`OWNER_EMAIL` is a required env var** (`lib/env.ts`) and gates signup at
  `app/(auth)/callback/route.ts` (~line 14) — currently only Foster can get an account.
  `isOwner()` in `lib/auth.ts` must be replaced by per-resource ownership checks.

- **The 2-responder anonymity floor is enforced only in application code**
  (`app/api/feedback/public-summary/route.ts`), with no database constraint. Multi-tenant,
  this becomes a legal control, not just a nicety. Every code path that surfaces feedback
  must enforce it.

**Investigate beyond this list.** Specifically worth auditing: the `files` upload path and
storage-bucket policies (the storage RLS in migration 007 already looks correctly
tenant-scoped via `auth.uid() = foldername[1]` — confirm); the feedback submission flow
(`app/api/feedback/submit/route.ts` — check for a non-atomic read-then-write on
`submission_count`, and whether `feedback_requests.expires_at` is checked as well as
`feedback_links.expires_at`); `content_embeddings` reaching `owner_id` only through a join
to `content_blocks` (consider denormalizing for tenant-filtered vector search); and any
remaining route that trusts input it should validate.

---

# Part 4 — Features to build

## Tenancy foundation

`profiles` table (user_id, slug, display_name, is_public, plan, created_at) with a unique
index on slug. Reserved-slug list. A single `resolveTenant(slug)` function that is the only
source of truth. Thread the tenant through every public path: about, chat, job-compare,
references, resume, feedback public-summary. Migrate the existing owner's data into a
profile row.

**A cross-tenant pgTAP test must be written before the refactor lands, not after** — user A
cannot read user B's content blocks, embeddings, feedback, or files. This is the guardrail
that makes every later phase safe. Treat it as the highest-priority deliverable in the
whole plan.

## Signup and onboarding

Open the auth callback. Slug picker with reserved-word and uniqueness validation. Then the
make-or-break flow: **upload a resume PDF -> parse -> content blocks -> embeddings -> live
site, in under five minutes.** The current dashboard assumes the user will hand-author
content blocks; a paying customer will not. Empty states throughout.

## Billing

Stripe Checkout plus the hosted Customer Portal — do not build custom billing UI. Webhook
into a `subscriptions` table. Plan gating. Trial handling. Plan for the ugly cases: webhook
replay/idempotency, failed payment, cancellation mid-period, and what happens to a public
page when a subscription lapses (suggest: unpublish, do not delete).

## Cost control — required before launch, not optional

Real rate limiting with a distributed store (Upstash Redis or equivalent). Per-tenant AI
usage metering and quotas, with hard caps per plan. Unbounded chat and embedding endpoints
against a metered LLM API is real money. The usage-accounting hooks must live in the
provider interface (see Part 5) so metering works regardless of which model is configured.

## Email — Resend

**The repo owner will set up Resend with their own custom domain and provide the API key
and sending domain.** Plan the integration assuming those exist as environment variables;
do not plan DNS or domain-verification steps. Transactional email needed:
feedback-request invitations to peers, feedback-received notifications, welcome/onboarding,
and billing lifecycle (trial ending, payment failed). Put email behind a thin interface as
well, mock it in tests, and never send from the test suite.

## Marketing surface

Landing page, pricing page, terms of service, privacy policy. The current `app/page.tsx` is
Foster's personal home page and becomes the per-tenant template. Note in the plan that this
product hosts resume PII plus anonymous third-party statements about named individuals,
shown to recruiters — flag that the owner should get legal review of the ToS/privacy copy
and the defamation surface before launch. Do not attempt to write legal copy yourself
beyond obvious placeholders.

## Launch hardening

Subdomain and custom-domain support via the middleware seam. Error monitoring. Analytics.
Security review. Load consideration for pgvector at multi-tenant scale.

---

# Part 5 — AI provider abstraction (explicit requirement)

The owner is considering moving off Gemini to Claude, DeepSeek, or Kimi K3. **All AI
features must sit behind a provider interface so the backing API can be swapped by
configuration**, and the plan must include a phase that establishes this before other
phases pile more Gemini-specific code on top.

Current state, which you must verify and account for:

- `lib/llm.ts` already exists and is described as a provider-agnostic layer, but **it
  leaks.** It only wraps `generateText` and `generateJSON`, and it hardcodes
  `provider: "gemini"`.
- **`generateWithContext()` and `embedText()` bypass `lib/llm.ts` entirely.**
  `app/api/chat/route.ts` imports `generateWithContext` straight from
  `lib/gemini/client.ts`, and the embedding path calls `embedText` directly. Sealing these
  two leaks is the core of the work.
- `chunkText()` also lives in `lib/gemini/client.ts` but is pure text processing with no
  Gemini dependency — it belongs somewhere provider-neutral.

Design constraints to reason about and resolve in the plan:

1. **Text generation and embeddings are separate interfaces.** They swap independently, and
   conflating them is the main design error to avoid here.
2. **Embedding dimensionality is load-bearing.** `content_embeddings.embedding` is
   `vector(768)`, and `lib/gemini/client.ts` pins `outputDimensionality: 768` specifically
   to match it. Any embedding-provider change means either matching 768 dimensions or a
   schema migration plus **re-embedding every tenant's content**. Plan that migration path
   explicitly, including how it runs per-tenant without downtime.
3. **Claude has no embeddings API.** Moving to Claude for text generation necessarily means
   a *different* provider for embeddings (Voyage, OpenAI, or staying on Gemini). The
   interface must permit mixing providers. Verify the current state of any provider's
   offerings rather than trusting this claim.
4. **Include usage/token accounting in the interface return type**, because per-tenant cost
   metering depends on it.
5. **Consider streaming** in the interface design — chat is the obvious beneficiary, and
   retrofitting streaming into a non-streaming interface is painful.
6. Provider selection by environment variable, with a documented capability matrix (which
   providers support structured JSON output, streaming, embeddings, and at what
   dimensions).
7. The existing test suite mocks Gemini. The refactor must keep the suite green and should
   make mocking *easier* by giving tests one seam to stub. Note that `evals/` also
   exercises the real API.

---

# Part 6 — Output specification

Write everything to `plans/saas-conversion/`.

## The overview file: `plans/saas-conversion/README.md`

Modeled on the existing `plans/README.md`. It must contain:

- What this plan set is and the end state it describes
- Project and stack context sufficient for a cold agent
- The business goal
- The settled architectural decisions from Part 2, with rationale, framed as
  "do not re-litigate"
- The consolidated list of vulnerabilities and issues, including everything you discover
  yourself, with file and line references
- A phase index table: phase number, filename, one-line description, dependencies, and
  whether it can be worked in parallel
- The recommended execution order, with explicit callouts where parallelism is safe
- A short paragraph summarizing each phase
- The per-phase workflow (read fully -> implement -> run the phase's verification -> one
  git commit -> report broken assumptions rather than working around them)
- A full end-to-end verification procedure for after all phases land
- An overall definition of done

## Phase files: `plans/saas-conversion/NN-slug.md`

Zero-padded, ordered by dependency (`00-`, `01-`, ...). Each file must contain:

- **Title and a one-line statement of what lands when this phase is done**
- **Depends on** — explicit phase links, and what specifically must already exist
- **Context** — enough that an agent with no memory can start cold. Restate the relevant
  parts rather than only linking to the README.
- **Files to create/modify** — actual paths, not vague descriptions
- **The work** — concrete, specific, ordered steps. Name functions, tables, columns,
  routes, env vars. Where a decision is genuinely open, state the recommendation and the
  trade-off rather than leaving it unresolved.
- **Tests** — exactly which tests to write and where, following the mirrored-location rule
  in `AGENTS.md`. Security-relevant phases must specify tests that fail before the change
  and pass after.
- **Docs to update** — which `docs/*.md` files this phase's changes obligate, per the
  docs-sync rule.
- **Verification** — commands to run and what green looks like. `npm run lint`,
  `npm run typecheck`, `npm test`, `npm run build` at minimum; add `npm run test:db` for
  schema phases and `npm run test:e2e` for flow phases.
- **Out of scope** — what belongs to a different phase. This matters for keeping a Sonnet
  agent from scope-creeping.
- **Rollback / risk notes** where the phase is destructive or touches live data.

## Phase sizing

Size each phase so a Sonnet-class agent can complete it in a single focused session without
running out of context. A phase touching more than roughly 10–15 files is probably two
phases. Prefer more, smaller, sharply-scoped phases over fewer large ones. Every phase must
leave the repository in a green, committable state — no phase may depend on a later phase
to restore a passing build.

## Ordering constraints

- The cross-tenant pgTAP guardrail test comes as early as is coherent.
- Security fixes from Part 3 come before feature work that builds on them.
- The AI provider interface lands before phases that add new AI features.
- Tenancy precedes signup; signup precedes billing. Billing before tenancy is wasted work.

---

# Part 7 — How to work

1. **Investigate first.** Read `AGENTS.md`, `docs/`, `plans/README.md`, the migrations, the
   route handlers, `lib/`, and the test suite before writing a single phase file. Verify
   every claim in Part 3 against the actual code — line numbers here are approximate and
   some listed bugs may already be fixed.
2. **Find what this brief missed.** The review that produced it was partial and time-boxed.
   Treat undiscovered problems as expected, not exceptional. Audit the public API surface
   in particular.
3. **Be specific over comprehensive.** A phase file that names the exact function to change
   beats one that describes a goal well.
4. **Flag genuine uncertainty** in the overview file rather than inventing a confident
   answer — especially anything depending on live third-party API behavior (provider
   capabilities, Stripe specifics, Supabase limits).
5. Do not write application code. Plans only.
6. When done, report: the phase list, roughly how much of the existing test suite each
   phase puts at risk, and anything you found that you believe changes the settled
   decisions in Part 2.
