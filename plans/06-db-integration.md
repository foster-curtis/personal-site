# Phase 06 — Docker-Gated Database Integration Tests

**Depends on:** [00-prerequisites.md](00-prerequisites.md) Task 0.2 (schema capture) —
**this phase cannot start until the schema is captured in migrations.** There is
currently nothing to migrate a local Postgres instance into, since `content_blocks`,
`content_embeddings`, `prompts`, `files`, the pgvector extension, and the
`match_embeddings()` function only exist in the hosted Supabase project. Also depends
loosely on [01-test-runner-foundation.md](01-test-runner-foundation.md) for the `db`
Vitest project. Requires Docker (confirmed available).

## Known issue: migration 004 breaks a fresh `supabase start`

Phase 00 captured the live schema into `005_content_core.sql` (creates `content_blocks`
and friends), but `004_content_blocks_important.sql` — which predates `005` and already
existed before Phase 00 — does `ALTER TABLE content_blocks ADD COLUMN IF NOT EXISTS
is_important ...`. On the hosted project this was always fine because `content_blocks`
was created out-of-band (manually, before any migration existed). On a **genuinely fresh
database** (which is exactly what `supabase start` bootstraps), migrations apply in
filename order — `001, 002, 003, 004, 005, 006, 007` — so `004` runs before `005` has
created the table it's altering, and fails with `relation "content_blocks" does not
exist`.

This was confirmed directly: both `supabase db pull` and `supabase db diff` build a
shadow database by replaying every local migration in order, and both hit this exact
error at `004` (see Phase 00's commit `efe3338` for the full repro). It is **not**
something Phase 00 introduced — `004` always assumed `content_blocks` already existed;
Phase 00 just made that assumption visible for the first time by adding the migration
that actually creates the table.

**Validated workaround order:** replaying `001, 002, 003, 005, 006, 007, 004` (i.e. `004`
last) against a scratch Postgres container built from `supabase/postgres:17.6.1.063`
applied cleanly end-to-end, and `004` landed as a true no-op (`NOTICE: column
"is_important" of relation "content_blocks" already exists, skipping`) since `005`
already creates the column. `content_blocks`'s resulting structure (columns, indexes,
FKs, RLS policies) matched the live project exactly.

**This phase needs to resolve the ordering before `supabase start` will work.** The
CLI always replays migrations in filename order with no way to override that, so pick one
of these:

- **Recommended — guard `004`, touch nothing else.** Wrap its `ALTER TABLE` so it's a
  no-op when the table doesn't exist yet:
  ```sql
  DO $$ BEGIN
    IF to_regclass('public.content_blocks') IS NOT NULL THEN
      ALTER TABLE content_blocks ADD COLUMN IF NOT EXISTS is_important BOOLEAN NOT NULL DEFAULT false;
      UPDATE content_blocks SET is_important = true WHERE type = 'resume';
    END IF;
  END $$;
  ```
  On a fresh database, `004` runs before `005` and now just quietly does nothing (instead
  of erroring); `005`'s own `CREATE TABLE` already includes `is_important` as a column, so
  nothing is lost. On the hosted project, `content_blocks` already exists, so this behaves
  exactly as `004` always did. No renumbering, no rewritten history, no change to the
  hosted project's applied-migrations tracking.
- **Alternative — renumber so schema-creation sorts before `004`.** Rename
  `005_content_core.sql` (and the two that follow it) to something that sorts between
  `003` and `004` — the CLI sorts migrations lexically by filename, not semantically, so
  this is legal. Rewrites filenames Phase 00 already committed for no real benefit over
  the guard above; only worth it if you have another reason to want schema-creation
  numbered ahead of `004`.
- **Alternative — squash `004` into `005` and delete `004`.** `005` already includes
  `is_important` in its `CREATE TABLE`, so `004` becomes fully redundant once squashed.
  This rewrites migration history, which Phase 00 was told not to do for the *hosted*
  project's sake (its tracking table already has version `004` marked applied) — but a
  fresh local stack doesn't care about that history, only the hosted project does. If you
  go this route, don't touch the hosted project's applied-migrations tracking, only local
  replay behavior.

Whichever fix you pick, confirm it by running `supabase db reset` (or equivalent fresh
`supabase start`) and watching all migrations apply without error in one pass — that's the
real acceptance bar, not just the validated manual reorder above.

## Context

`personal-site` is a Next.js/TypeScript AI-powered interactive resume backed by Supabase
(Postgres + pgvector) with Row Level Security policies gating access to anonymous peer
feedback and owner-only content. Full project context is in [README.md](README.md).

This phase is intentionally separate from the mocked route-handler tests in Phase 03: it
exists to verify the things **only a real database can verify** — RLS actually isolating
data between users, and the `match_embeddings` similarity-search function actually
returning the right shape and behavior. It's marked opt-in (`npm run test:db`) and
excluded from the default `npm test` run so the main suite stays fast, offline, and
Docker-free.

## Setup

Apply the migration-004 fix from "Known issue" above **before** running `supabase start`
for the first time — otherwise this fails partway through with `relation "content_blocks"
does not exist`.

```bash
npx supabase init      # safe to run even with existing migrations present
supabase start
```

Supabase's own testing guide (<https://supabase.com/docs/guides/local-development/testing/overview>)
is explicit about the approach here: *"Running `supabase start` gives you a real Postgres
database, auth system, and generated APIs on your machine... Your tests run against the
same schema, Row Level Security policies, and API endpoints that your production app
uses. No mocking, no fake data, no surprises when you deploy."*

**Tooling: pgTAP**, Postgres's native unit-testing extension, which is what Supabase's own
guides use for exactly this kind of RLS verification. Use
`usebasejump/supabase-test-helpers` (<https://github.com/usebasejump/supabase-test-helpers>)
to remove the boilerplate around switching Postgres roles and setting JWT claims to
simulate different authenticated users. Structure:

```sql
begin;
select plan(N);
-- create test users, set local role authenticated, set request.jwt.claims, etc.
-- assertions via pgTAP's ok()/is()/etc.
select * from finish();
rollback;
```

Create tests via `supabase test new <name>`, run them via `supabase test db`.

Supabase's own framing of why this matters is worth internalizing before writing these:
*"A wrong RLS policy doesn't throw an error, it just returns the wrong rows, so it ships
untested and you find out when data leaks."* RLS bugs are silent by nature — this is the
only phase in the whole plan that can catch them.

## What to test (only verifiable against a real database)

1. **RLS actually isolates owners.** Migration `002_feedback_tables.sql` uses an `EXISTS`
   subquery pattern across `feedback_requests`/`feedback_links`/`feedback_responders`/
   `feedback_responses` (owner-scoped via `auth.uid() = owner_id` or a join back to it).
   Create two authenticated test users, seed data for user A, and assert user B's queries
   return zero rows across all four tables — not an error, just correctly empty.
2. **`feedback_responses` has no INSERT policy for authenticated/anon roles** — by design,
   anonymous feedback submission only works via the service-role admin client (this is
   documented in the migration file itself). Assert: an anon-role client attempting an
   insert is rejected; the service-role/admin client succeeds.
3. **`match_embeddings` returns the shape `EmbeddingMatch` expects**, and that
   `match_threshold` and `match_count` params actually filter/limit results — this is
   currently unverifiable from source at all, since the function isn't defined anywhere in
   the repo (it only exists in the hosted project, captured into migrations by Phase 00).
   Seed a handful of `content_embeddings` rows with known vectors, call `match_embeddings`
   with a query vector, and assert the returned rows match `{id, content_block_id,
   chunk_index, chunk_text, similarity}`. **Note:** pgvector's ANN indexes (HNSW/IVFFlat)
   are approximate — don't assert exact result ordering; assert set membership on a small
   fixture instead, or explicitly force exact search within the test session if the schema
   uses an ANN index type.
4. **`about_cache`'s RLS policy is `FOR ALL USING (true) WITH CHECK (true)`** — this reads
   as effectively open to any role that can reach the table at all, which looks more like
   an oversight than an intentional design choice. Write a test that demonstrates the
   current (permissive) behavior, and flag it explicitly in the test's description/comment
   as "confirm this is intentional" rather than silently treating it as correct.
5. **Cascade deletes** down the chain `feedback_requests → feedback_links →
   feedback_responders → feedback_responses` — deleting a `feedback_requests` row should
   cascade-delete everything under it (the migration defines `ON DELETE CASCADE`
   throughout; confirm it actually behaves that way).

## Isolation caveat

The Supabase CLI can only run one local database at a time, so these tests share the
local dev instance rather than getting fresh per-test-file isolation the way Testcontainers-based
setups would. Wrap each test (or each pgTAP test file) in a transaction and roll back at
the end — standard pgTAP structure (`begin; ... rollback;`) already does this. If you're
also writing any JS/TS-level integration tests against the local stack (as opposed to pure
pgTAP SQL files), Vitest 4.1's `aroundEach` hook is purpose-built for wrapping a test in a
transaction/rollback pair — use it there instead of manual `beforeEach`/`afterEach` cleanup.

## CI note (for whoever picks up Phase 08)

Supabase documents an official CI pattern for exactly this
(<https://supabase.com/docs/guides/deployment/ci/testing>):

```yaml
- uses: supabase/setup-cli@v1
  with:
    version: latest
- run: supabase db start
- run: supabase test db
```

`supabase start --exclude studio,inbucket,imgproxy` trims boot time in CI by skipping
services this test suite doesn't need. Leave this as a note for Phase 08 rather than
building the CI job in this phase — this phase is scoped to the tests themselves.

## Verification

- `supabase start` succeeds and reports pgvector, Auth, and Postgres all running.
- `supabase test db` runs the full pgTAP suite and every test passes.
- Deliberately break one RLS policy locally (e.g. temporarily widen a `USING` clause) and
  confirm the corresponding test fails — this proves the test is actually checking
  something, not just checking that queries don't error.
- `npm run test:db` (the Vitest-side wrapper, if any JS-level DB tests were added
  alongside the pgTAP suite) passes.
- Run the suite twice in a row without a manual `supabase db reset` in between and confirm
  it's still green — transaction rollback should mean no state leaks between runs.

## Commit

One commit for this phase, e.g.:
`test: add pgTAP RLS and match_embeddings tests against local Supabase stack`
