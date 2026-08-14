---
name: new-api-route
description: Use when creating a new Route Handler under app/api/ — captures the auth-check, validation, error-handling, and testing conventions shared by the existing routes.
---

## Placement

`app/api/<name>/route.ts`, or `app/api/<name>/[id]/route.ts` for a dynamic segment (mirror
`app/api/data/[id]/route.ts`). Export named `GET`/`POST`/`PATCH`/`DELETE` functions.

## Auth

See `.claude/rules/api-route-auth.md` for the exact owner-check snippet and the
admin-client-bypass implication — don't re-derive it, copy it verbatim into each exported
handler that's owner-only.

## Validation

Most owner-only routes just do simple presence/type checks on the parsed body (see the
`validTypes` check in `app/api/data/route.ts`). `lib/validation.ts` is reserved for the one
fully-public write endpoint (`/api/feedback/submit`) — pull it in only if the new route is
similarly public and write-accessible.

## Error handling

Wrap the handler body in try/catch. Return `NextResponse.json({ error }, { status })` for
every response. Status codes in use: `400` (bad input), `401` (unauthorized), `404` (not
found/not owned), `500` (unexpected). Most routes just `console.error` in the catch block;
`lib/logging.ts`'s structured logger is used in only 3 routes — prefer it if you're already
adding observability, but don't be surprised most routes don't use it.

## Supabase client

Use `createClient()` from `lib/supabase/server.ts` for owner-scoped CRUD, plus an explicit
`.eq("owner_id", user.id)` on every query as defense in depth even though RLS also enforces
it (matches existing routes). Only reach for `createAdminClient()` if the route must serve
unauthenticated requests — and if so, document in the route what invariant substitutes for
RLS (see `.claude/rules/api-route-auth.md`).

## Add a test

Add `tests/api/<name>.test.ts` (mirror an existing one, e.g. `tests/api/data.test.ts`).
Mock `@/lib/supabase/server` and `@/lib/auth` with `vi.mock`, and use the shared helpers:
`tests/helpers/request.ts` (`mockGetRequest`/`mockJsonRequest`) and
`tests/helpers/supabase-mock.ts` (`createMockSupabaseClient`/`asSupabaseClient`). Cover at
minimum: the 401 unauthenticated case, the 401 non-owner case (if owner-only), and one
success path.

## Update the docs

Add the new route to `docs/api-reference.md` (method, auth marker, request/response shape,
any quirks) in the same change — see `AGENTS.md`'s docs-sync rule.
