# Documentation Index

This is a single-owner personal portfolio site: **Foster Curtis** is the only
"owner" account, and the whole app is built around that assumption even
though the database schema looks multi-tenant (`owner_id` columns
everywhere). See [architecture.md](./architecture.md#single-owner-assumption)
for why that matters before you change anything auth- or ownership-related.

Public visitors can:
- Read an AI-generated "About" page
- Chat with a RAG-powered assistant that answers questions about the owner
- Paste a job description and get an AI fit analysis against the owner's resume
- View an aggregated, anonymized summary of peer feedback ("References")
- Submit anonymous peer feedback via a tokenized link

The owner (and only the owner) can log in and reach `/dashboard` to manage
resume/story content, answer AI-generated self-interview prompts, upload
files, and manage feedback requests + AI analysis.

## Where to start

| Doc | Read this for |
|---|---|
| [architecture.md](./architecture.md) | Tech stack, folder layout, request flow, the single-owner assumption, admin-client bypass pattern |
| [dev-setup.md](./dev-setup.md) | Getting a local environment running, required env vars, known-broken scripts |
| [data-model.md](./data-model.md) | Every table, its columns, RLS policies, and the **schema that isn't in migrations** |
| [api-reference.md](./api-reference.md) | Every API route: method, auth requirement, request/response shape |
| [auth-and-security.md](./auth-and-security.md) | How login/authorization works, RLS vs. admin-client bypass, validation, rate-limit headers (informational only) |
| [ai-pipeline.md](./ai-pipeline.md) | RAG chat, embeddings, About-page generation, job comparison, feedback analysis — all the Gemini call sites |
| [frontend.md](./frontend.md) | Route map, page-by-page behavior, shared components, styling conventions |

## Conventions used across these docs

- File paths are repo-relative, e.g. `lib/auth.ts`.
- "Owner" always means the single account whose email matches `OWNER_EMAIL`.
- "Admin client" means `createAdminClient()` from `lib/supabase/admin.ts`,
  which uses the Supabase **service role key** and bypasses Row Level
  Security entirely. Any route that uses it is responsible for its own
  authorization checks in code — RLS will not save you there.
