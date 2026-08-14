# Auth & Security

## Identity model: one owner, gated by email

There's no roles table. Authorization is a single function:

```ts
// lib/auth.ts
export function isOwner(user: User | null): boolean {
  if (!user?.email) return false;
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    console.warn("OWNER_EMAIL environment variable is not set");
    return false;
  }
  return user.email.toLowerCase() === ownerEmail.toLowerCase();
}
```

Anyone can sign up via `/login` (Supabase Auth, email + password,
`supabase.auth.signUp`) — signup is **not restricted**. What differs is
what a signed-in user can *do*: only the account whose email matches
`OWNER_EMAIL` (case-insensitive) is treated as the owner and can reach
`/dashboard` or any owner-only API route. Everyone else who signs in gets
redirected to `/access-denied`, a deliberately friendly 403 page (not an
error state) that offers sign-out and points back to the public features.

## Where the owner check happens (defense in depth, not a single gate)

1. **`middleware.ts`** — runs on almost every route (see matcher below),
   but it only *refreshes the session cookie*; it does not itself
   check `isOwner()` or block any route. Don't rely on it for
   authorization.
2. **`app/dashboard/layout.tsx`** (server component) — the actual UI gate.
   Redirects to `/login` if unauthenticated, `/access-denied` if
   authenticated-but-not-owner. This protects every page under
   `/dashboard/*` in one place.
3. **Every owner-only API route, independently** — each route handler in
   `app/api/**` starts with its own `getUser()` + `isOwner()` check. This
   is intentional redundancy: the layout only protects page navigation,
   not direct API calls (someone could `curl /api/data` without ever
   loading `/dashboard`), so each route re-verifies. When adding a new
   owner-only route, copy this pattern — don't assume the layout covers you:
   ```ts
   const user = await getUser();
   if (!user || !isOwner(user)) {
     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
   }
   ```

## `app/(auth)/callback/route.ts`

Handles Supabase's auth code exchange (used for magic-link/email
confirmation flows via `exchangeCodeForSession`). On success, it branches
immediately on `isOwner`-equivalent logic (inlined email comparison) to
send the owner to `/dashboard` and everyone else to `/access-denied`. Any
failure or missing code falls through to `/login?error=auth_failed`.

## The three Supabase client factories — pick the right one

| Factory | File | Auth context | RLS |
|---|---|---|---|
| `createClient()` (browser) | `lib/supabase/client.ts` | Whatever cookie session exists client-side | Enforced |
| `createClient()` (server) | `lib/supabase/server.ts` | Reads/writes the Next.js cookie store; used in server components and API routes | Enforced |
| `createAdminClient()` | `lib/supabase/admin.ts` | None — uses `SUPABASE_SERVICE_ROLE_KEY` | **Bypassed entirely** |

The server and browser clients are both named `createClient` but live in
different files — import from the one matching where you're running
(`@/lib/supabase/server` in server components/route handlers, `@/lib/supabase/client`
in `"use client"` components). Using the admin client anywhere reachable by
an unauthenticated request means **you** are the authorization layer for
that data — see [architecture.md](./architecture.md#the-admin-client-bypass-pattern)
for the full list of routes that do this and why.

## Middleware: what it actually does

```ts
// middleware.ts, matcher excludes _next/static, _next/image, favicon.ico, and image files
```

For every matched request:
1. Refreshes the Supabase auth cookie via `supabase.auth.getUser()` (this
   is what keeps sessions alive across navigations — removing this call
   would cause silent logouts).
2. For paths starting with `/api/`, adds:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-RateLimit-Limit` / `X-RateLimit-Window` — **informational only**.
     The code comment is explicit about this: these headers communicate a
     *recommended* limit (10 req/60s for `/api/feedback/submit` and
     `/api/chat`, 60 req/60s otherwise) for upstream infrastructure to
     enforce. **Nothing in this codebase actually rejects a request for
     exceeding them.** If you need real rate limiting (e.g. before this
     goes further above trivial traffic), it has to be added at the
     Vercel/CDN edge or via a KV-backed check — not assumed to already
     exist here.

## Input validation & sanitization (`lib/validation.ts`)

Used specifically for the anonymous feedback-submission path (the only
fully public *write* endpoint that isn't LLM-gated by cost):

- `validateString(value, fieldName, { required, minLength, maxLength, pattern })` —
  generic building block.
- `validateFeedbackSubmission(body)` — token must be 20–100 chars;
  `metadata.relationship/worked_from/worked_to` capped at 100/50/50 chars;
  every `content` field capped at 10,000 chars, and the whole serialized
  `content` object capped at 50,000 bytes.
- `sanitizeString`/`sanitizeStringObject` — trims and hard-truncates
  string values before they're written to the DB (defense in depth beyond
  validation, applied in `app/api/feedback/submit/route.ts` right before
  insert).

Other public POST endpoints (`/api/chat`, `/api/job-compare`) do **not**
run input through this module — they only check for presence/non-empty,
not length. Both call an LLM per request with no caching, so they're the
most cost-exposed routes if abused; if you're hardening this app further,
start there.

## Structured logging (`lib/logging.ts`)

A JSON structured logger (`logger.info/warn/error/debug`, plus a
`logger.timed()` wrapper for duration tracking) with a `LogEvents` constant
map for consistent event names. It's fully built out but only actually
used in `app/api/feedback/submit`, `app/api/feedback/public-summary`, and
`app/api/about`. Every other route uses plain `console.error`/`console.log`.
If you're adding observability to a route, prefer `logger` for
consistency, but don't be surprised the rest of the codebase doesn't use it
yet.

## Secrets checklist

| Env var | Exposure | What it gates |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Full DB bypass via admin client — treat as a master key |
| `OWNER_EMAIL` | server-only | Who `isOwner()` says yes to — effectively "who has admin access" |
| `GEMINI_API_KEY` | server-only | Billed LLM calls |

Full env var list, including public ones, is in
[dev-setup.md](./dev-setup.md#environment-variables).
