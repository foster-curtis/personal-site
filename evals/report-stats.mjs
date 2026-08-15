#!/usr/bin/env node
// Plain JS (not TS) on purpose: this needs to run under plain `node` with no build step,
// regardless of whether the machine running it has the TS-stripping support this repo's own
// tooling (Vite/evalite) provides.
//
// Hard rule from plans/07-rag-evals.md: report mean ± standard deviation per eval, not a
// single sample. evalite's own CLI table shows one averaged score per eval; this reads the
// same --outputPath JSON and breaks that average back out into per-scorer mean/stddev
// across every trial (see trialCount in the .eval.ts files), so a run's variance is visible,
// not just its average.
import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "results/latest.json";
const run = JSON.parse(readFileSync(path, "utf8"));

function mean(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(nums) {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const variance = nums.reduce((a, b) => a + (b - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

console.log(`\nEval run ${run.run.createdAt}\n`);

for (const evalEntry of run.evals) {
  const scoresByName = new Map();
  for (const result of evalEntry.results) {
    for (const score of result.scores) {
      if (!scoresByName.has(score.name)) scoresByName.set(score.name, []);
      scoresByName.get(score.name).push(score.score ?? 0);
    }
  }

  console.log(evalEntry.name);
  for (const [name, scores] of scoresByName) {
    const m = mean(scores);
    const sd = stddev(scores);
    console.log(`  ${name}: mean=${m.toFixed(3)}  stddev=${sd.toFixed(3)}  (n=${scores.length})`);
  }
  console.log("");
}
