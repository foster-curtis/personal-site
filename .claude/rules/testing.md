---
paths:
  - "lib/**/*.ts"
  - "components/**/*.tsx"
  - "app/**/*.tsx"
  - "app/api/**/*.ts"
  - "middleware.ts"
  - "supabase/migrations/**/*.sql"
---

# Testing conventions

New or changed production code needs a test in the mirrored location:

- `lib/**/*.ts` → `tests/unit/lib/**`, mirroring the subdirectory
  (e.g. `lib/feedback/tokens.ts` → `tests/unit/lib/feedback/tokens.test.ts`)
- `components/**` or a page/component under `app/**` → `tests/components/**`, mirroring
  the path (e.g. `app/(public)/chat/page.tsx` → `tests/components/app/(public)/chat/page.test.tsx`)
- `app/api/**/route.ts` → `tests/api/**`, mirroring the route path minus `route.ts`
  (e.g. `app/api/data/route.ts` → `tests/api/data.test.ts`)
- `middleware.ts` (root-level, outside `lib`/`components`/`app`, runs on nearly every
  request) → `tests/api/middleware.test.ts`
- `supabase/migrations/**/*.sql` (schema, RLS policy, or function changes) → a pgTAP test
  in `supabase/tests/*.sql`, verified with `npm run test:db` (needs `npx supabase start`).
  This is a different test type (SQL/pgTAP) from everything else in this list.
- A new full user-facing workflow (spans multiple pages/routes) → a Playwright spec in
  `tests/e2e/*.spec.ts`. Small tweaks to an existing flow just mean updating that flow's
  existing spec, not writing a new one.
- Any bug fix, regardless of which file it's in → a regression test that fails before the
  fix and passes after.

## Mocking

Gemini and Supabase are mocked by default (`tests/setup/`, `tests/helpers/supabase-mock.ts`).
Unit, component, and API/route tests must not make real network or LLM calls — that's what
the opt-in `test:db` (real local Postgres) and `test:eval` (real Gemini, not yet
implemented) suites are for.

## Verification

- `npm test` — the fast, offline default (unit + api + component projects). Run this for
  almost every change.
- `npm run test:e2e` — only when the change touches a full user-facing workflow.
- `npm run test:db` — only when the change touches the database layer (migrations, RLS,
  the `match_embeddings` function).

For the fuller testing-architecture rationale (mocking decisions, what's covered on day
one), see `plans/README.md` — that folder is a working plan for the test-suite build-out,
not a maintained doc, so treat it as background reading only.
