Create a new Route Handler under `app/api/`, following this repo's conventions.

**Placement:** `app/api/<name>/route.ts`, or `app/api/<name>/[id]/route.ts` for a dynamic
segment (mirror `app/api/data/[id]/route.ts`). Export named `GET`/`POST`/`PATCH`/`DELETE`
functions.

**Auth:** every owner-only handler starts with (see `.cursor/rules/api-route-auth.mdc` for
the full pattern and the admin-client-bypass implication):
```ts
const user = await getUser();
if (!user || !isOwner(user)) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Validation:** simple presence/type checks on the parsed body is the norm (see
`app/api/data/route.ts`'s `validTypes` check). `lib/validation.ts` is reserved for the one
fully-public write endpoint (`/api/feedback/submit`).

**Error handling:** wrap the handler in try/catch, `console.error` in the catch block,
`NextResponse.json({ error }, { status })` for every response. Status codes in use: 400,
401, 404, 500.

**Supabase client:** `createClient()` from `lib/supabase/server.ts` plus an explicit
`.eq("owner_id", user.id)` as defense in depth. Only use `createAdminClient()` if the route
must serve unauthenticated requests, and document what substitutes for RLS if so.

**Add a test:** `tests/api/<name>.test.ts`, mirroring `tests/api/data.test.ts` — mock
`@/lib/supabase/server` and `@/lib/auth`, use `tests/helpers/request.ts` and
`tests/helpers/supabase-mock.ts`. Cover the 401 unauthenticated case, the 401 non-owner
case (if owner-only), and one success path. See `.cursor/rules/testing.mdc`.

**Update docs:** add the new route to `docs/api-reference.md` (method, auth, shape,
quirks) in the same change.
