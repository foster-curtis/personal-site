# personal-site

An AI-powered interactive resume. Visitors chat with a RAG-backed assistant grounded in
the owner's real experience, paste a job description for an AI fit analysis, view an
anonymized summary of peer feedback, and submit anonymous peer feedback via a tokenized
link. The owner logs in to a dashboard to manage resume/story content, self-interview
prompts, files, and feedback requests.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Supabase
(Postgres + pgvector, Auth, Storage), Google Gemini, PostHog.

## Quick start

```
npm install
cp .env.example .env.local   # fill in real values — see docs/dev-setup.md
npm run dev
```

> `npm run export` / `npm run deploy` are broken leftover `create-next-app` scripts and
> won't produce a working build (this app uses API routes and middleware). Deploy with
> `npm run build && npm run start`, or Vercel.

Run `npm test` to run the unit/route/component test suite.

## Documentation

Full docs: [docs/README.md](./docs/README.md)

This repo is set up for AI coding agents (Cursor, Claude Code) — see
[AGENTS.md](./AGENTS.md).
