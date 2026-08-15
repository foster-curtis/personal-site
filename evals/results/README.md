# Eval results

`npm run test:eval` writes `latest.json` here (via evalite's `--outputPath`) and prints a
mean/stddev summary per scorer. Commit `latest.json` after each manual run so quality drift
across the four categories is visible in git history / PR diffs, per plans/07-rag-evals.md —
this repo has no scheduled eval run yet (see the CI note in `evals/README.md`), so nothing
updates this file automatically.

No `latest.json` is committed yet: this phase was built without real Gemini/Supabase
credentials in the environment that wrote it (see `evals/README.md`), so nobody has run the
suite for real yet. The first real run should replace this note with a committed
`latest.json`.
