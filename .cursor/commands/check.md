Run these four commands in order. Stop at the first failure and report which stage failed
along with the raw output — don't continue to later stages.

```
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` runs the unit/api/component Vitest projects. It's offline and fast — Supabase
and Gemini are mocked, no network or Docker needed.

These heavier checks are not part of this sequence — only run them if the change
specifically calls for it:

- `npm run test:e2e` — Playwright smoke suite, needs a build first
- `npm run test:db` — needs `npx supabase start`; only relevant for changes touching
  migrations, RLS, or the `match_embeddings` function
- `npm run test:coverage`

Never run `npm run export` or `npm run deploy` — both are broken leftover
`create-next-app` scripts unrelated to verification.
